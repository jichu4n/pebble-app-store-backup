import * as winston from 'winston';

export default winston.createLogger({
  format: winston.format.simple(),
  transports: [new winston.transports.Console()],
});
