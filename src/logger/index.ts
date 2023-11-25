import log from 'simple-node-logger';

const opts = {
        timestampFormat:'YYYY-MM-DD HH:mm:ss.SSS'
};

export default log.createSimpleLogger(opts);