import * as fs from 'fs-extra';
import * as _ from 'lodash';
import * as path from 'path';
import logger from './logger';
import {
  APPS_DIR_NAME,
  DEFAULT_OUTPUT_DIR_PATH,
  WATCHFACES_DIR_NAME,
} from './metadata-scraper';

/**
 * Listings in as encoded in metadata JSON files.
 *
 * Only fields needed for backup are listed here.
 */
export interface Listing {
  id: string;
  latest_release: {
    pbw_file: string;
  };
  screenshot_images: {[size: string]: string}[];
  list_image: {[size: string]: string};
  icon_image: {[size: string]: string};
}

interface MetadataFile {
  filePath: string;
  listings: Listing[];
}

export interface MetadataFileReaderOptions {
  metadataDirPath?: string;
}

export class MetadataFileReader {
  constructor(options: MetadataFileReaderOptions) {
    this.options = options;
  }

  getAllListings(): Promise<Listing[]> {
    if (!this.allListingsPromise) {
      this.allListingsPromise = (async () => {
        let metadataDirPath =
          this.options.metadataDirPath || DEFAULT_OUTPUT_DIR_PATH;
        let metadataFiles = [
          ...(await this.readMetadataFiles(
            path.join(metadataDirPath, WATCHFACES_DIR_NAME)
          )),
          ...(await this.readMetadataFiles(
            path.join(metadataDirPath, APPS_DIR_NAME)
          )),
        ];
        return _(metadataFiles)
          .flatten()
          .map('listings')
          .flatten()
          .value();
      })();
    }
    return this.allListingsPromise;
  }

  private async readMetadataFiles(dirPath: string): Promise<MetadataFile[]> {
    let fileNames = await fs.readdir(dirPath);
    return fileNames.reduce(
      async (resultsPromise: Promise<MetadataFile[]>, fileName: string) => {
        let results = await resultsPromise;
        let filePath = path.join(dirPath, fileName);
        logger.info(`Loading metadata from ${filePath}`);
        let resultJson = await fs.readJson(filePath);
        return [
          ...results,
          {
            filePath,
            listings: resultJson['data'] as Listing[],
          },
        ];
      },
      Promise.resolve([] as MetadataFile[])
    );
  }

  private options: MetadataFileReaderOptions;
  private allListingsPromise: Promise<Listing[]>;
}

if (require.main === module) {
  new MetadataFileReader({}).getAllListings();
}
