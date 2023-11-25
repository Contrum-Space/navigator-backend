"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config({
    path: '~/Dev/maps/.env'
});
var express_1 = __importDefault(require("express"));
var app = (0, express_1.default)();
app.listen(process.env.PORT, function () {
    console.log("Server online");
});
app.get('/', function (req, res) {
    res.send("Hello");
});
