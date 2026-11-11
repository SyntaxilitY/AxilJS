"use strict";
/**
 * @axiljs/validation - Public API
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = exports.RecordValidator = exports.UnionValidator = exports.LiteralValidator = exports.EnumValidator = exports.ObjectValidator = exports.ArrayValidator = exports.BooleanValidator = exports.NumberValidator = exports.StringValidator = exports.BaseValidator = exports.v = void 0;
var schema_1 = require("./schema");
Object.defineProperty(exports, "v", { enumerable: true, get: function () { return schema_1.v; } });
Object.defineProperty(exports, "BaseValidator", { enumerable: true, get: function () { return schema_1.BaseValidator; } });
Object.defineProperty(exports, "StringValidator", { enumerable: true, get: function () { return schema_1.StringValidator; } });
Object.defineProperty(exports, "NumberValidator", { enumerable: true, get: function () { return schema_1.NumberValidator; } });
Object.defineProperty(exports, "BooleanValidator", { enumerable: true, get: function () { return schema_1.BooleanValidator; } });
Object.defineProperty(exports, "ArrayValidator", { enumerable: true, get: function () { return schema_1.ArrayValidator; } });
Object.defineProperty(exports, "ObjectValidator", { enumerable: true, get: function () { return schema_1.ObjectValidator; } });
Object.defineProperty(exports, "EnumValidator", { enumerable: true, get: function () { return schema_1.EnumValidator; } });
Object.defineProperty(exports, "LiteralValidator", { enumerable: true, get: function () { return schema_1.LiteralValidator; } });
Object.defineProperty(exports, "UnionValidator", { enumerable: true, get: function () { return schema_1.UnionValidator; } });
Object.defineProperty(exports, "RecordValidator", { enumerable: true, get: function () { return schema_1.RecordValidator; } });
var middleware_1 = require("./middleware");
Object.defineProperty(exports, "validate", { enumerable: true, get: function () { return middleware_1.validate; } });
//# sourceMappingURL=index.js.map