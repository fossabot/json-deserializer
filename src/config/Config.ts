/**
 * @file Config
 * @author yibuyisheng(yibuyisheng@163.com)
 */
import {isArray, isObject} from '../utils';
import {createError, ErrorCode} from '../Error';

const PARENT_KEY = typeof (window as any).Symbol === 'undefined' ? '__parent__' : Symbol('parent');
const STEP_KEY = typeof (window as any).Symbol === 'undefined' ? '__step__' : Symbol('step');

export interface IObject {
    [key: string]: any;
}

export default abstract class Config {
    public readonly config: any;

    public constructor(config: any) {
        this.config = this.normalize(config);
    }

    public upConfig(item: any): any {
        if (!isObject(item) || !item[STEP_KEY]) {
            throw createError(ErrorCode.ERR_WRONG_UP_CONFIG, `Wrong up config: ${item}.`);
        }

        const current = item;
        const step = item[STEP_KEY];
        return this.up(current, step);
    }

    public up(current: any, step: number): any {
        if (step === 0) {
            return current;
        }

        if (!isObject(current)) {
            return;
        }

        return this.up((current as any)[PARENT_KEY], step - 1);
    }

    public isUpper(item: any): boolean {
        return typeof item === 'string' && /^\^[0-9]+$/.test(item) || (isObject(item) && item[STEP_KEY]);
    }

    public stringifyConfig(config: any): string {
        if (config instanceof Array) {
            const output: string[] = [];
            config.reduce((prev, cur) => {
                prev.push(this.stringifyConfig(cur));
                return prev;
            }, output);
            return `[${output.join(', ')}]`;
        }

        if (isObject(config)) {
            const output: string[] = [];
            /* tslint:disable forin */
            for (const key in config) {
            /* tslint:enable forin */
                output.push(`${key}: ${this.stringifyConfig(config[key])}`);
            }
            return `{${output.join(', ')}}`;
        }

        if (this.isLeaf(config)) {
            return config.toString();
        }

        return JSON.stringify(config);
    }

    public abstract isLeaf(item: any): boolean;

    protected abstract normalizeLeaf(item: any): any;

    private normalizeArray(config: any[]): any[] | undefined {
        const result: any[] = [];
        config.forEach((item) => {
            const itemConfig = this.normalize(item);
            if (isObject(itemConfig) || isArray(itemConfig)) {
                itemConfig[PARENT_KEY] = config;
                result.push(itemConfig);
            }
        });
        return result.length ? result : undefined;
    }

    private normalizeObject(config: IObject): IObject | undefined {
        const result: IObject = config;
        /* tslint:disable forin */
        for (const key in config) {
        /* tslint:enable forin */
            const cfg = this.normalize(config[key]);
            if (isObject(cfg) || isArray(cfg)) {
                cfg[PARENT_KEY] = config;
                result[key] = cfg;
            }
        }
        return Object.keys(result).length ? result : undefined;
    }

    private normalize(config: any) {
        if (this.isLeaf(config)) {
            const result = this.normalizeLeaf(config);
            return result;
        }

        if (this.isUpper(config)) {
            return {
                [STEP_KEY]: parseInt(config.replace('^', ''), 10)
            };
        }

        if (isArray(config)) {
            const result = this.normalizeArray(config);
            return result;
        }

        if (isObject(config)) {
            const result = this.normalizeObject(config);
            return result;
        }

        throw createError(ErrorCode.ERR_WRONG_CONFIG, `Unknown config: ${JSON.stringify(config)}`);
    }
}
