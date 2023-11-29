"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
var body_parser_1 = __importDefault(require("body-parser"));
var cors_1 = __importDefault(require("cors"));
var express_1 = __importDefault(require("express"));
var config_1 = __importDefault(require("./config"));
var logger_1 = __importDefault(require("./logger"));
var Graph_1 = __importDefault(require("./models/Graph"));
var System_1 = __importDefault(require("./models/System"));
config_1.default.getConfig();
var app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(body_parser_1.default.json());
app.listen((_a = config_1.default.config) === null || _a === void 0 ? void 0 : _a.port, function () {
    var _a;
    logger_1.default.info("Server online on port ".concat((_a = config_1.default.config) === null || _a === void 0 ? void 0 : _a.port));
});
app.get('/', function (req, res) {
    res.send("Hello");
});
app.post('/systems', function (req, res) {
    var _a = req.body, system = _a.system, stargateJumps = _a.stargateJumps, lightyears = _a.lightyears, jumpDriveRange = _a.jumpDriveRange, mode = _a.mode;
    var systems = [];
    if (mode === 'stargate') {
        systems = System_1.default.findSystemsWithStargateJumps(system, parseInt(stargateJumps));
    }
    else if (mode === 'lightyears') {
        systems = System_1.default.findSystemsWithinRange(system, parseFloat(lightyears));
    }
    else if (mode === 'jump drive') {
        systems = System_1.default.findSystemsWithinRange(system, parseFloat(jumpDriveRange));
    }
    res.send({ data: { systems: systems } });
});
app.post('/graph', function (req, res) {
    var systems = req.body.systems;
    var systemsData = System_1.default.getConnectedSystems(systems);
    var graph = Graph_1.default.applyForceDirectedLayout(systemsData);
    res.send({ data: { graph: graph } });
});
app.post('/search', function (req, res) {
    var query = req.body.query;
    var matchedSystemNames = System_1.default.fuzzySearchSystemByName(query);
    res.send({ data: { matchedSystemNames: matchedSystemNames } });
});
