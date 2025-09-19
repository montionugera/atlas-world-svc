// Centralized logging utility

// LOG_LEVELS will be used in future logging enhancements
// import { LOG_LEVELS } from '../config/constants';

export class Logger {
    private logger: any;
    private context: string;

    constructor(logger: any, context: string = 'AtlasWorld') {
        this.logger = logger;
        this.context = context;
    }

    info(message: string, ...args: any[]): void {
        this.logger.info(`[${this.context}] ${message}`, ...args);
    }

    error(message: string, error?: any, ...args: any[]): void {
        this.logger.error(`[${this.context}] ${message}`, error, ...args);
    }

    warn(message: string, ...args: any[]): void {
        this.logger.warn(`[${this.context}] ${message}`, ...args);
    }

    debug(message: string, ...args: any[]): void {
        this.logger.debug(`[${this.context}] ${message}`, ...args);
    }
}

export function createLogger(logger: any, context: string): Logger {
    return new Logger(logger, context);
}
