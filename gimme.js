/*****************************************************************************************
    gimme.js - A very small node.js HTTP/S request library

    @param url {string} URL to request
    @param method {string} Request method e.g. GET, POST, PUT etc. Defaults to GET if undefined
    @param body {object} Object to hold body data to send
    @param contentType {string} Form / JSON
    @param headers {object} object to hold http headers
    @param followRedirect {object} true / false
    @param maxRedirects {number} Max number of redirects allowed. Defaults to 10
    @param timeout {number} Milliseconds before timeout is forced: Defaults to 10000}
    @param rejectUnauthorized {boolean} true / false
    @returns {object} {status, header, body}

    ** Example Usage **
    let requestOptions = {
        url: 'https://www.httpbin.org/absolute-redirect/8',
        // url: 'https://user:pass@sub.host.com:8080/p/a/t/h?query=string#hash',
        method: 'post',
        contentType: 'form',
        body: {
            msg: 'Post test',
            number: 1968,
            formData: 'abcdef12345'
        },
        followRedirect: true,
        maxRedirects: 10,
        timeout: 15000,
        rejectUnauthorized: false
    }

        gimme.request(requestOptions)
        .then((result) => {
            let tmpResult = JSON.parse(result);
            res.end('BODY:' + tmpResult.body + '\n' + 'PAGE LOAD:' + tmpResult.pageLoad + '\n' + 'HEADERS: ' + tmpResult.headers);
        }, (err) => {
            console.log(err);
            res.end(err);
        });
*/

const url = require('url');
const querystring = require('querystring');

function MyError(message) {
    this.name = 'MyError';
    this.message = message || 'Error:';
    this.stack = (new Error()).stack;
}

const request = function(requestOptions) {
    //** Validate request options properties and set defaults
    typeof requestOptions.url === "undefined" || requestOptions.url === null ? requestOptions.url = null : requestOptions.url = requestOptions.url;
    typeof requestOptions.method === "undefined" ? requestOptions.method = 'GET' : requestOptions.method = requestOptions.method.toUpperCase();
    typeof requestOptions.body === "undefined" ? requestOptions.body = null : requestOptions.body = requestOptions.body;
    typeof requestOptions.contentType === "undefined" ? requestOptions.contentType = 'FORM' : requestOptions.contentType = requestOptions.contentType.toUpperCase();
    typeof requestOptions.followRedirect === "undefined" ? requestOptions.followRedirect = true : requestOptions.followRedirect = requestOptions.followRedirect;
    typeof requestOptions.maxRedirects === "undefined" ? requestOptions.maxRedirects = 10 : requestOptions.maxRedirects = requestOptions.maxRedirects;
    typeof requestOptions.timeout === "undefined" ? requestOptions.timeout = 10000 : requestOptions.timeout = requestOptions.timeout;
    typeof requestOptions.headers === "undefined" ? requestOptions.headers = {} : requestOptions.headers = requestOptions.headers;
    //** typeof requestOptions.rejectUnauthorized === "undefined" ? requestOptions.rejectUnauthorized = true : requestOptions.rejectUnauthorized = requestOptions.rejectUnauthorized;

    return new Promise((resolve, reject) => {
        //** No url, no worky!
        if(requestOptions.url === null) {
            let infoObj = {
                code: 'ERR',
                msg: 'URL MISSING'
            }
            reject(JSON.stringify(infoObj));
        };

        //** If protocol is missing backfill and assume http
        if(requestOptions.url.search(/^http[s]?\:\/\//) == -1){
            requestOptions.url = 'http://' + requestOptions.url;
        };

        //** Parse the URL into an object
        let requestObject = url.parse(requestOptions.url.toString());

        //** Options object for making request
        const options = {
            hostname: requestObject.hostname,
            path: requestObject.path,
            method: requestOptions.method
        };

        //** Defined the port ??undefined
        if(requestObject.port === null && requestObject.protocol === null) {
            options.port = 80 //** Assume http
        } else if(requestObject.port === null && requestObject.protocol === 'https:') {
            options.port = 443;
        } else if(requestObject.port === null && requestObject.protocol === 'http:') {
            options.port = 80;
        } else {
            options.port = requestObject.port;
        };

        //** Set headers
        options.headers = requestOptions.headers;

        var postData = null;
        //** If body in payload parse and set data accordingly
        if(requestOptions.body !== null) {
            if(requestOptions.method === 'GET'){
                options.path += '?' + querystring.stringify(requestOptions.body);
            } else {
                //** Populate the data to send
                postData = JSON.stringify(requestOptions.body);

                //** Set headers
                switch (requestOptions.contentType){
                    case 'JSON':
                        options.headers['Content-Type'] = 'application/json';
                        options.headers['Content-Length'] = postData.length;
                    break;
                    case 'FORM':
                        options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                        options.headers['Content-Length'] = postData.length;
                    break;
                    default:
                        options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                        options.headers['Content-Length'] = postData.length;
                    break;
                };
            };
        };

        //** Select the required module to make the call
        const lib = requestOptions.url.startsWith('https') ? require('https') : require('http');

        //** Make the request call
        const request = lib.request(options, (response) => {
            response.on('continue', () => {
                //** Received continue response from server
            });

            //** Handle server response codes
            if((response.statusCode >= 300 && response.statusCode < 400) && response.headers.location) {
                if(requestOptions.followRedirect && requestOptions.maxRedirects > 0) {
                    if (url.parse(response.headers.location).hostname) { //** For absolute redirect
                        requestOptions.url = response.headers.location;
                        --requestOptions.maxRedirects;
                        request.abort();
                        resolve(this.request(requestOptions));
                        return;
                    } else { //** For realtive redirect
                        requestOptions.url = url.parse(requestOptions.url).hostname + response.headers.location;
                        --requestOptions.maxRedirects;
                        request.abort();
                        resolve(this.request(requestOptions));
                        return;
                    }
                }
            } else if(response.statusCode >= 400 && response.statusCode < 500) { //** Client Error
                let errObj = {
                    code: 'ERR',
                    msg: 'CLIENT ERROR: ' + response.statusCode
                }
                reject(errObj);
            } else if(response.statusCode >= 500) { //** Server Error
                let errObj = {
                    code: 'ERR',
                    msg: 'SERVER ERROR: ' + response.statusCode
                }
                reject(errObj);
            };

            // temporary data holder
            let body = [];

            // on every content chunk, push it to the data array
            response.on('data', (chunk) => {
                body.push(chunk)
            });

            // res.on("end", function () {
            //     var body = Buffer.concat(chunks);
            //     console.log(body.toString());
            // });
            //** we are done, resolve promise with joined chunks
            response.on('end', () => {
                let requestResult = {
                    status: response.statusCode,
                    headers: JSON.stringify(response.headers)
                };
                requestResult.body = body.join('');
                resolve(requestResult);
            });
        });
        
        request.on('error', function (err) {
            let errObj = {
                code: err.code,
                msg: err.syscall
            }
            reject(errObj);
        });

        request.on('socket', function (socket) {
            socket.setTimeout(requestOptions.timeout);
            socket.on('timeout', function() {
                request.abort();
                let infoObj = {
                    code: 'ERR',
                    msg: 'timeout'
                }
                reject(JSON.stringify(infoObj));
            });
        });

        if(typeof postData !== "undefined" && postData !== null){
            request.write(postData);
        }

        request.end();
    });
};

module.exports = {
    request: request
};