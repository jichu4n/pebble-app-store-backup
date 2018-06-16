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
  latest_release: {
    pbw_file: string;
  };
  screenshot_images: {[size: string]: string}[];
  list_image: {[size: string]: string};
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
      let metadataDirPath =
        this.options.metadataDirPath || DEFAULT_OUTPUT_DIR_PATH;
      this.watchfacesMetadataFilesPromise = this.readMetadataFiles(
        path.join(metadataDirPath, WATCHFACES_DIR_NAME)
      );
      this.appsMetadataFilesPromise = this.watchfacesMetadataFilesPromise.then(
        () => this.readMetadataFiles(path.join(metadataDirPath, APPS_DIR_NAME))
      );
      this.allListingsPromise = Promise.all([
        this.watchfacesMetadataFilesPromise,
        this.appsMetadataFilesPromise,
      ]).then((metadataFiles: MetadataFile[][]) =>
        _(metadataFiles)
          .flatten()
          .map('listings')
          .flatten()
          .value()
      );
    }
    return this.allListingsPromise;
  }

  private readMetadataFiles(dirPath: string): Promise<MetadataFile[]> {
    return fs.readdir(dirPath).then((fileNames: string[]) =>
      fileNames.reduce(
        (resultsPromise: Promise<MetadataFile[]>, fileName: string) =>
          resultsPromise.then((results: MetadataFile[]) => {
            let filePath = path.join(dirPath, fileName);
            logger.info(`Loading metadata from ${filePath}`);
            return fs.readJson(filePath).then((resultJson: any) => [
              ...results,
              {
                filePath,
                listings: resultJson['data'] as Listing[],
              },
            ]);
          }),
        Promise.resolve([])
      )
    );
  }

  private options: MetadataFileReaderOptions;
  private appsMetadataFilesPromise: Promise<MetadataFile[]>;
  private watchfacesMetadataFilesPromise: Promise<MetadataFile[]>;
  private allListingsPromise: Promise<Listing[]>;
}

if (require.main === module) {
  new MetadataFileReader({}).getAllListings();
}
