import * as contentDisposition from 'content-disposition';
import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as _ from 'lodash';
import * as minimist from 'minimist';
import * as papa from 'papaparse';
import * as path from 'path';
import * as request from 'request-promise-native';
import * as uuidv4 from 'uuid/v4';
import logger from './logger';
import {
  Listing,
  MetadataFileReader,
  MetadataFileReaderOptions,
} from './metadata';

export const DEFAULT_OUTPUT_DIR_PATH = path.normalize(
  path.join(__dirname, '..', 'data')
);
export const PBW_DIR_NAME = 'pbw';
export const IMAGE_DIR_NAME = 'images';
export const BLOB_SCRAPER_LOG_FILE_NAME = 'log.csv';

export interface BlobScraperLogRecord {
  listingId: string;
  url: string;
  etag: string;
  fileName: string;
  sha1: string;
}

export interface BlobScraperOptions extends MetadataFileReaderOptions {
  outputDirPath: string;
  maxNumFiles?: number;
}

export class BlobScraper {
  constructor(options: BlobScraperOptions) {
    this.options = options;
    this.metadataFileReader = new MetadataFileReader(options);
  }

  scrapePbwFiles() {
    this.applyToListings(async (listing: Listing, index: number) =>
      this.scrapeBlob(
        index,
        listing.id,
        _.get(listing, ['latest_release', 'pbw_file'], ''),
        PBW_DIR_NAME
      )
    );
  }

  private async applyToListings(
    fn: (listing: Listing, index: number) => Promise<void>
  ) {
    let listings = await this.metadataFileReader.getAllListings();
    if (this.options.maxNumFiles) {
      listings = listings.slice(0, this.options.maxNumFiles);
    }
    listings.reduce(async (indexPromise: Promise<number>, listing: Listing) => {
      let index = await indexPromise;
      await fn(listing, index);
      return index + 1;
    }, Promise.resolve(0));
  }

  private async scrapeBlob(
    index: number,
    listingId: string,
    url: string,
    dirName: string
  ): Promise<void> {
    let record: BlobScraperLogRecord = {
      listingId: listingId,
      url,
      fileName: '',
      etag: '',
      sha1: '',
    };
    if (!url) {
      logger.info(`[${index}] Missing URL, skipping`);
    } else {
      let hasExistingValidOutputFile = false;
      let records = await this.getBlobScraperLogRecords(dirName);
      if (records.has(url)) {
        record = records.get(url);
        let outputFilePath = this.getOutputFilePath(dirName, record);
        if (await fs.pathExists(outputFilePath)) {
          let content = await fs.readFile(outputFilePath);
          hasExistingValidOutputFile = this.getSha1Hash(content) == record.sha1;
        }
      }
      if (hasExistingValidOutputFile) {
        logger.info(
          `[${index}] Skipping valid existing output file for ${url}`
        );
      } else {
        record.fileName = '';
        record.etag = '';
        record.sha1 = '';
        try {
          logger.info(`[${index}] Fetching from ${url}`);
          let response: request.FullResponse = await request.get(url, {
            resolveWithFullResponse: true,
          });
          record.fileName =
            `${uuidv4()}--` +
            (response.headers['content-disposition']
              ? contentDisposition.parse(
                  response.headers['content-disposition']
                ).parameters['filename']
              : '');
          record.etag = _.trim((response.headers['etag'] || '') as string, '"');
          record.sha1 = this.getSha1Hash(response.body);
          logger.info(`[${index}] --> ${record.fileName}`);
          await fs.outputFile(
            this.getOutputFilePath(dirName, record),
            response.body
          );
        } catch (e) {
          logger.error(`[${index}] Failed to scrape ${url}: ${e}`);
        }
      }
    }
    return this.writeBlobScraperLogRecord(dirName, index, record);
  }

  private writeBlobScraperLogRecord(
    dirName: string,
    index: number,
    record: BlobScraperLogRecord
  ) {
    return ((index == 0 ? fs.outputFile : fs.appendFile) as (
      filePath: string,
      data: any
    ) => Promise<void>)(
      this.getBlobScraperLogFilePath(dirName),
      papa.unparse(
        {
          fields: ['url', 'etag', 'fileName', 'sha1'],
          data: [record.url, record.etag, record.fileName, record.sha1],
        },
        {
          header: index == 0,
        } as papa.UnparseConfig
      ) + '\r\n'
    );
  }

  private async getBlobScraperLogRecords(
    dirName: string
  ): Promise<Map<string, BlobScraperLogRecord>> {
    if (!this.blobScraperLogRecordsByDirName.has(dirName)) {
      this.blobScraperLogRecordsByDirName.set(
        dirName,
        (async () => {
          let blobScraperLogFilePath = this.getBlobScraperLogFilePath(dirName);
          logger.info(
            `Loading blob scraper log records from ${blobScraperLogFilePath}`
          );
          if (!(await fs.pathExists(blobScraperLogFilePath))) {
            return new Map<string, BlobScraperLogRecord>();
          }
          let content = await fs.readFile(blobScraperLogFilePath, 'utf8');
          return new Map<string, BlobScraperLogRecord>(
            (papa.parse(content, {
              header: true,
            }).data as BlobScraperLogRecord[]).map(
              (record: BlobScraperLogRecord) =>
                [record.url, record] as [string, BlobScraperLogRecord]
            )
          );
        })()
      );
    }
    return this.blobScraperLogRecordsByDirName.get(dirName);
  }

  private getBlobScraperLogFilePath(dirName: string): string {
    return path.join(
      this.options.outputDirPath,
      dirName,
      BLOB_SCRAPER_LOG_FILE_NAME
    );
  }

  private getOutputFilePath(dirName: string, record: BlobScraperLogRecord) {
    return path.join(this.options.outputDirPath, dirName, record.fileName);
  }

  private getSha1Hash(content: string | Buffer) {
    return crypto
      .createHash('sha1')
      .update(content)
      .digest('hex');
  }

  private options: BlobScraperOptions;
  private metadataFileReader: MetadataFileReader;
  private blobScraperLogRecordsByDirName: Map<
    string,
    Promise<Map<string, BlobScraperLogRecord>>
  > = new Map();
}

if (require.main === module) {
  let args = minimist(process.argv.slice(2), {
    string: ['outputDirPath'],
    boolean: ['shouldScrapePbwFiles', 'shouldScrapeImages'],
    default: {
      outputDirPath: DEFAULT_OUTPUT_DIR_PATH,
      shouldScrapePbwFiles: false,
      shouldScrapeImages: false,
      maxNumFiles: null,
    },
  });
  let blobScraper = new BlobScraper({
    outputDirPath: args.outputDirPath,
    maxNumFiles: args.maxNumFiles,
  });
  let result = Promise.resolve();
  if (args.shouldScrapePbwFiles) {
    result = result.then(() => blobScraper.scrapePbwFiles());
  } else {
    logger.info('Skipping PBW files (enable with --shouldScrapePbwFiles)');
  }
}
