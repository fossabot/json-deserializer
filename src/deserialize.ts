/**
 * @file deserialize
 * @author yibuyisheng(yibuyisheng@163.com)
 */
import {createError, ErrorCode} from './Error';
import Parser, {IOption} from './Parser';

export type JSONBaseType = string | number | true | false | null;

export interface IJSONObject {
    [key: string]: JSONBaseType | IJSONObject | IJSONArray;
}

export interface IJSONArray {
    [index: number]: JSONBaseType | IJSONObject | IJSONArray;
}

export interface IParserConstructor {
    new (options?: IOption | Record<string, any>): Parser;
}

export interface IArrayConfig {
    [field: number]: IParserConstructor | IArrayConfig | IObjectConfig;
}

export interface INormalizedFieldParserConfig {
    parser: IParserConstructor;
    from: string;
    [key: string]: any;
}

export interface IObjectConfig {
    [field: string]: IParserConstructor | INormalizedFieldParserConfig | IArrayConfig | IObjectConfig;
}

function isParserConstructor(parser: any): boolean {
    if (!parser) {
        return false;
    }

    const proto = Object.getPrototypeOf(parser);
    return proto === Parser || proto instanceof Parser;
}

function isParserConfig(config: any): boolean {
    return config && isParserConstructor(config.parser);
}

function isObject(val: any): boolean {
    return val !== null && typeof val === 'object';
}

function deserializeArray(
    jsonArray: IJSONArray,
    config: IParserConstructor | IArrayConfig | INormalizedFieldParserConfig,
): IJSONArray {
    const result: IJSONArray = [];
    type JSONObject = IJSONObject | IJSONArray | JSONBaseType;
    type ConfigObject = IParserConstructor | IArrayConfig | IObjectConfig;

    // config instanceof IParserConstructor
    if (isParserConstructor(config)) {
        const parser = new (config as IParserConstructor)();
        (jsonArray as JSONObject[]).reduce<IJSONArray>((prev, val, index) => {
            prev[index] = parser.parse(val);
            return prev;
        }, result);
    }
    // config instanceof IArrayConfig
    else if (config instanceof Array) {
        let lastParser: Parser;
        (jsonArray as JSONObject[]).reduce<IJSONArray>((prev, val, index) => {
            const parserConfig = config[index];
            // parserConfig instanceof IParserConstructor
            if (isParserConstructor(parserConfig)) {
                const parser = new (parserConfig as IParserConstructor)();
                result[index] = val instanceof Array
                    ? deserializeArray(val, parserConfig)
                    : parser.parse(val);
                lastParser = parser;
            }
            // parserConfig instanceof IArrayConfig
            else if (parserConfig instanceof Array) {
                if (val && !(val instanceof Array)) {
                    throw createError(
                        ErrorCode.ERR_SCHEMA_NOT_MATCH,
                        `Not match: [val] ${JSON.stringify(val)} [config] ${JSON.stringify(parserConfig)}`,
                        {config: parserConfig, val},
                    );
                } else if (val) {
                    result[index] = deserializeArray(val as IJSONArray, parserConfig);
                }
            }
            // parserConfig instanceof INormalizedFieldParserConfig
            else if (isParserConfig(parserConfig)) {
                const parser = new ((parserConfig as INormalizedFieldParserConfig).parser)(parserConfig);
                result[index] = val instanceof Array ? deserializeArray(val, parserConfig) : parser.parse(val);
                lastParser = parser;
            }
            // 普通配置对象，继续往下解析
            else if (isObject(parserConfig)) {
                if (isObject(val)) {
                    result[index] = deserializeObject(val as IJSONObject, parserConfig);
                } else if (val !== undefined) {
                    throw createError(
                        ErrorCode.ERR_SCHEMA_NOT_MATCH,
                        `Not match: [val] ${JSON.stringify(val)} [config] ${JSON.stringify(parserConfig)}`,
                        {config: parserConfig, val},
                    );
                }
            }
            // 配置的 parser 数量少于待转换的数据量，就直接用之前的 parser 来转换剩下的元素
            else if (parserConfig === undefined && lastParser) {
                result[index] = lastParser.parse(val);
            }
            return prev;
        }, result);
    }
    // config instanceof INormalizedFieldParserConfig
    else {
        const parser = new ((config as INormalizedFieldParserConfig).parser as IParserConstructor)(config);
        (jsonArray as JSONObject[]).reduce<IJSONArray>((prev, val, index) => {
            prev[index] = parser.parse(val);
            return prev;
        }, result);
    }

    return result;
}

function deserializeObject(jsonObject: IJSONObject, config: IObjectConfig): IJSONObject {
    const result: IJSONObject = {};

    /* tslint:disable forin */
    for (const field in config) {
    /* tslint:enable forin */
        const parserConfig = config[field];

        // config instanceof IParserConstructor
        if (isParserConstructor(parserConfig)) {
            if (jsonObject[field] instanceof Array) {
                result[field] = deserializeArray(jsonObject[field] as IJSONArray, parserConfig);
            } else {
                const normalizedConfig = {
                    parser: parserConfig as IParserConstructor,
                    from: field,
                };
                const parser = new normalizedConfig.parser({isRequired: false, ...normalizedConfig});
                result[field] = parser.parse(jsonObject[normalizedConfig.from]);
            }
        }
        // config instanceof INormalizedFieldParserConfig
        else if (isParserConfig(parserConfig)) {
            const cfg = parserConfig as Partial<INormalizedFieldParserConfig>;
            const normalizedConfig = {
                ...cfg,
                parser: cfg.parser as IParserConstructor,
                from: cfg.from || field,
            };

            if (jsonObject[normalizedConfig.from] instanceof Array) {
                result[field] = deserializeArray(jsonObject[normalizedConfig.from] as IJSONArray, parserConfig);
            } else {
                const parser = new normalizedConfig.parser({isRequired: false, ...normalizedConfig});
                result[field] = parser.parse(jsonObject[normalizedConfig.from]);
            }
        }
        // config instanceof IArrayConfig
        else if (parserConfig instanceof Array) {
            if (jsonObject[field] instanceof Array) {
                result[field] = deserializeArray(jsonObject[field] as IJSONArray, parserConfig as IArrayConfig);
            } else if (jsonObject[field] !== undefined) {
                throw createError(
                    ErrorCode.ERR_SCHEMA_NOT_MATCH,
                    `Not match: [val] ${JSON.stringify(jsonObject[field])} [config] ${JSON.stringify(parserConfig)}`,
                    {config: parserConfig, val: jsonObject[field], field},
                );
            }
        }
        // config instanceof IObjectConfig
        else {
            if (isObject(jsonObject[field])) {
                result[field] = deserializeObject(jsonObject[field] as IJSONObject, parserConfig as IObjectConfig);
            } else if (jsonObject[field] !== undefined) {
                throw createError(
                    ErrorCode.ERR_SCHEMA_NOT_MATCH,
                    `Not match: [val] ${JSON.stringify(jsonObject[field])} [config] ${JSON.stringify(parserConfig)}`,
                    {config: parserConfig, val: jsonObject[field], field},
                );
            }
        }
    }

    return result;
}

/**
 * 反序列化入口函数。
 */
export default function deserialize<P extends Parser>(
    jsonObject: IJSONObject | IJSONArray | JSONBaseType,
    config: IParserConstructor | INormalizedFieldParserConfig | IArrayConfig | IObjectConfig,
): IJSONObject | IJSONArray | undefined {
    if (isParserConstructor(config)) {
        if (jsonObject instanceof Array) {
            return deserializeArray(jsonObject, config);
        }

        const parser = new (config as IParserConstructor)();
        return parser.parse(jsonObject);
    }

    if (isParserConfig(config)) {
        if (jsonObject instanceof Array) {
            return deserializeArray(jsonObject, config);
        }

        const parser = new ((config as INormalizedFieldParserConfig).parser)(config);
        return parser.parse(jsonObject);
    }

    if (config instanceof Array) {
        if (jsonObject instanceof Array) {
            return deserializeArray(jsonObject, config);
        }

        throw createError(
            ErrorCode.ERR_SCHEMA_NOT_MATCH,
            `Not match: [val] ${JSON.stringify(jsonObject)} [config] ${JSON.stringify(config)}`,
            {config, val: jsonObject},
        );
    }

    if (isObject(jsonObject)) {
        return deserializeObject(jsonObject as IJSONObject, config as IObjectConfig);
    }

    throw createError(
        ErrorCode.ERR_SCHEMA_NOT_MATCH,
        `Not match: [val] ${JSON.stringify(jsonObject)} [config] ${JSON.stringify(config)}`,
        {config, val: jsonObject},
    );
}