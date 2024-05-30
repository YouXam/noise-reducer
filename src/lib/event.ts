type EventMap = {
    [eventName: string]: any;
};

export class AsyncEventEmitter<T extends EventMap> {
    events: { [K in keyof T]?: ((value: T[K]) => void)[] } = {};

    emit<K extends keyof T>(eventName: K, value: T[K]): void;
    emit<K extends keyof T>(eventName: K): void;
    emit<K extends keyof T>(eventName: K, value?: T[K]): void {
        const listeners = this.events[eventName];
        if (listeners) {
            listeners.forEach(listener => listener(value as T[K]));
        }
    }

    wait<K extends keyof T>(eventName: K): Promise<T[K]> {
        return new Promise(resolve => {
            if (!this.events[eventName]) {
                this.events[eventName] = [];
            }
            this.events[eventName]!.push(resolve);
        });
    }
}