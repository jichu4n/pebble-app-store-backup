import * as fs from 'fs-extra';
import * as minimist from 'minimist';
import * as path from 'path';
import * as request from 'request-promise-native';
import logger from './logger';

const DEFAULT_OUTPUT_DIR_PATH = path.normalize(
  path.join(__dirname, '..', 'data', 'metadata')
);
const WATCHFACES_API_URL =
  'https://api2.getpebble.com/v2/apps/collection/all/watchfaces';
const WATCHFACES_DIR_NAME = 'watchfaces';
const APPS_API_URL =
  'https://api2.getpebble.com/v2/apps/collection/all/watchapps-and-companions';
const APPS_DIR_NAME = 'apps';
// 100 is max supported query limit.
const QUERY_LIMIT = 100;
const FILE_NAME_WIDTH = 4;

export interface MetadataScraperOptions {
  outputDirPath: string;
  shouldScrapeWatchfaces: boolean;
  shouldScrapeApps: boolean;
  maxNumPages?: number;
}

export class MetadataScraper {
  constructor(options: MetadataScraperOptions) {
    this.options = options;
  }

  run(): Promise<void> {
    let result = Promise.resolve();
    if (this.options.shouldScrapeWatchfaces) {
      result = result.then(() => {
        logger.info('Scraping watchfaces');
        return this.scrapePageToFile(
          WATCHFACES_API_URL,
          path.join(this.options.outputDirPath, WATCHFACES_DIR_NAME),
          0,
          0
        );
      });
    } else {
      logger.info('Skipping watchfaces (enable with --shouldScrapeWatchfaces)');
    }
    if (this.options.shouldScrapeApps) {
      result = result.then(() => {
        logger.info('Scraping apps');
        return this.scrapePageToFile(
          APPS_API_URL,
          path.join(this.options.outputDirPath, APPS_DIR_NAME),
          0,
          0
        );
      });
    } else {
      logger.info('Skipping apps (enable with --shouldScrapeApps)');
    }
    return result;
  }

  private scrapePageToFile(
    apiUrl: string,
    outputDirPath: string,
    numScrapedPages: number,
    offset: number
  ): Promise<void> {
    if (
      this.options.maxNumPages &&
      numScrapedPages >= this.options.maxNumPages
    ) {
      logger.info(`[${numScrapedPages}] Stopping`);
      return Promise.resolve();
    }
    logger.info(`[${numScrapedPages}] Scraping entries from ${offset}`);
    let hasNextPage: boolean;
    return request
      .get(apiUrl, {
        qs: {
          limit: QUERY_LIMIT,
          offset,
        },
        json: true,
      })
      .then((resultJson: any) => {
        hasNextPage = resultJson['links'] && resultJson['links']['nextPage'];
        let outputFilePath = path.join(
          outputDirPath,
          `${numScrapedPages.toString().padStart(FILE_NAME_WIDTH, '0')}.json`
        );
        logger.info(`[${numScrapedPages}] Writing to file ${outputFilePath}`);
        return fs.outputJson(outputFilePath, resultJson);
      })
      .then(
        () =>
          hasNextPage
            ? this.scrapePageToFile(
                apiUrl,
                outputDirPath,
                numScrapedPages + 1,
                offset + QUERY_LIMIT
              )
            : Promise.resolve()
      );
  }

  private options: MetadataScraperOptions;
}

if (require.main === module) {
  let args = minimist(process.argv.slice(2), {
    string: ['outputDirPath'],
    boolean: ['shouldScrapeWatchfaces', 'shouldScrapeApps'],
    default: {
      outputDirPath: DEFAULT_OUTPUT_DIR_PATH,
      shouldScrapeWatchfaces: false,
      shouldScrapeApps: false,
      maxNumPages: null,
    },
  });
  new MetadataScraper((args as any) as MetadataScraperOptions).run();
}
