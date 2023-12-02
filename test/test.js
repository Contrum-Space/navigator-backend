const autocannon = require('autocannon');

autocannon({
    url: 'http://localhost:8000/systems',
    method: 'POST',
    body: JSON.stringify({
        system: "Jita",
        lightyears: 8,
        mode: "lightyears"
    }),
    connections: 2500,
    pipelining: 150,
    duration: 10
}, console.log);