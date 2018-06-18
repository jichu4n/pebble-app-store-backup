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
  path.join(__dirname, '..', 'data', 'blobs')
);
export const BLOB_SCRAPER_LOG_FILE_NAME = 'log.csv';

export interface BlobScraperLogRecord {
  listingId: string;
  type: string;
  url: string;
  etag: string;
  origFileName: string;
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

  async scrapeBlobs() {
    let listings = await this.metadataFileReader.getAllListings();
    if (this.options.maxNumFiles) {
      listings = listings.slice(0, this.options.maxNumFiles);
    }
    for (let i = 0; i < listings.length; ++i) {
      let listing = listings[i];
      let records = await this.getBlobScraperLogRecords(listing.id);
      if (
        records &&
        _.every(
          await records.map((record) =>
            this.isOutputFileValid(listing.id, record)
          )
        )
      ) {
        logger.info(`[${i}] Skipping ${listing.id}`);
        continue;
      }
      logger.info(`[${i}] Processing ${listing.id}`);
      records = _.filter([
        await this.scrapeBlob(
          i,
          listing.id,
          'pbw',
          _.get(listing, ['latest_release', 'pbw_file'], '')
        ),
        ...(await Promise.all(
          _
            .flatten((listing.screenshot_images || []).map(Object.entries))
            .map(([size, url]) =>
              this.scrapeBlob(i, listing.id, `screenshot_images-${size}`, url)
            )
        )),
        ...(await Promise.all(
          Object.entries(listing.list_image).map(([size, url]) =>
            this.scrapeBlob(i, listing.id, `list_image-${size}`, url)
          )
        )),
      ]);
      await this.writeBlobScraperLogRecords(listing.id, records);
    }
  }

  private async scrapeBlob(
    index: number,
    listingId: string,
    type: string,
    url: string
  ): Promise<BlobScraperLogRecord> {
    if (!url) {
      logger.info(`[${index}] Missing URL for ${type}, skipping`);
      return null;
    }
    let record: BlobScraperLogRecord = {
      listingId,
      type,
      url,
      origFileName: '',
      fileName: '',
      etag: '',
      sha1: '',
    };
    try {
      logger.info(`[${index}] Fetching ${type} from ${url}`);
      let response: request.FullResponse = await request.get(url, {
        resolveWithFullResponse: true,
      });
      record.origFileName = response.headers['content-disposition']
        ? contentDisposition.parse(response.headers['content-disposition'])
            .parameters['filename']
        : '';
      record.fileName = uuidv4();
      record.etag = _.trim((response.headers['etag'] || '') as string, '"');

      record.sha1 = this.getSha1Hash(response.body);
      logger.info(`[${index}] ${type} --> ${record.fileName}`);
      await fs.outputFile(
        this.getOutputFilePath(listingId, record),
        response.body
      );
    } catch (e) {
      logger.error(`[${index}] Failed to scrape ${type} from ${url}: ${e}`);
    }
    return record;
  }

  private writeBlobScraperLogRecords(
    listingId: string,
    records: BlobScraperLogRecord[]
  ): Promise<void> {
    return fs.outputFile(
      this.getBlobScraperLogFilePath(listingId),
      papa.unparse(
        {
          fields: ['url', 'etag', 'origFileName', 'fileName', 'sha1'],
          data: records.map((record) => [
            record.url,
            record.etag,
            record.origFileName,
            record.fileName,
            record.sha1,
          ]),
        },
        {
          header: true,
        } as papa.UnparseConfig
      ) + '\r\n'
    );
  }

  private async getBlobScraperLogRecords(
    listingId: string
  ): Promise<BlobScraperLogRecord[]> {
    let blobScraperLogFilePath = this.getBlobScraperLogFilePath(listingId);
    logger.info(
      `Loading blob scraper log records from ${blobScraperLogFilePath}`
    );
    if (!(await fs.pathExists(blobScraperLogFilePath))) {
      return null;
    }
    let content = await fs.readFile(blobScraperLogFilePath, 'utf8');
    return papa.parse(content, {
      header: true,
    }).data as BlobScraperLogRecord[];
  }

  private async isOutputFileValid(
    listingId: string,
    record: BlobScraperLogRecord
  ): Promise<boolean> {
    let hasExistingValidOutputFile = false;
    if (!record.fileName || !record.sha1) {
      return false;
    }
    let outputFilePath = this.getOutputFilePath(listingId, record);
    if (!(await fs.pathExists(outputFilePath))) {
      return false;
    }
    let content = await fs.readFile(outputFilePath);
    return this.getSha1Hash(content) == record.sha1;
  }

  private getBlobScraperLogFilePath(listingId: string) {
    return path.join(
      this.options.outputDirPath,
      listingId,
      BLOB_SCRAPER_LOG_FILE_NAME
    );
  }

  private getOutputFilePath(listingId: string, record: BlobScraperLogRecord) {
    return path.join(this.options.outputDirPath, listingId, record.fileName);
  }

  private getSha1Hash(content: string | Buffer) {
    return crypto
      .createHash('sha1')
      .update(content)
      .digest('hex');
  }

  private options: BlobScraperOptions;
  private metadataFileReader: MetadataFileReader;
}

if (require.main === module) {
  let args = minimist(process.argv.slice(2), {
    string: ['outputDirPath'],
    default: {
      outputDirPath: DEFAULT_OUTPUT_DIR_PATH,
      maxNumFiles: null,
    },
  });
  let blobScraper = new BlobScraper({
    outputDirPath: args.outputDirPath,
    maxNumFiles: args.maxNumFiles,
  });
  blobScraper.scrapeBlobs();
}
