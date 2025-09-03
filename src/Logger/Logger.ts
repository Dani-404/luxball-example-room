import LogLevel from "./LogLevel";

export default class Logger {
    sendLog(logKey: keyof typeof LogLevel, message: string): void {
        console.log(LogLevel[logKey].bgColor, LogLevel[logKey].name, "\x1b[0m", message);
    }

    sendCriticalError(message: string): void {
        this.sendLog("CRITICAL_ERROR", message);

        if(typeof window === 'undefined')
            process.exit;
    }
}