"use strict";
/**
 * AxilJS MVC Example — App Configuration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const config_1 = require("@axiljs/config");
(0, config_1.loadEnv)();
exports.config = (0, config_1.defineConfig)({
    PORT: { type: 'number', default: 3001 },
    HOST: { type: 'string', default: '127.0.0.1' },
    NODE_ENV: { type: 'string', default: 'development' },
    JWT_SECRET: { type: 'string', default: 'axiljs-mvc-secret-minimum-32-chars!!' }
});
//# sourceMappingURL=app.config.js.map