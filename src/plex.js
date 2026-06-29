const axios = require('axios')

class Plex {
    constructor(opts) {
        this._accessToken = typeof opts.accessToken !== 'undefined' ? opts.accessToken : ''
        let uri = "http://127.0.0.1:32400";
        if ( (typeof opts.uri) !== 'undefined' ) {
            uri = opts.uri;
            if (uri.endsWith("/")) {
                uri = uri.slice(0, uri.length - 1);
            }
        }
        this._server = {
            uri: uri,
            host: typeof opts.host !== 'undefined' ? opts.host : '127.0.0.1',
            port: typeof opts.port !== 'undefined' ? opts.port : '32400',
            protocol: typeof opts.protocol !== 'undefined' ? opts.protocol : 'http'
        }
        this._headers = {
            'Accept': 'application/json',
            'X-Plex-Device': 'Coax',
            'X-Plex-Device-Name': 'Coax',
            'X-Plex-Product': 'Coax',
            'X-Plex-Version': '0.1',
            'X-Plex-Client-Identifier': 'rg14zekk3pa5zp4safjwaa8z',
            'X-Plex-Platform': 'Chrome',
            'X-Plex-Platform-Version': '80.0'
        }
    }

    get URL() { return `${this._server.uri}` }

    async SignIn(username, password) {
        if (typeof username === 'undefined' || typeof password === 'undefined')
            throw new Error("Plex 'SignIn' Error - No Username or Password was provided to sign in.")
        const params = new URLSearchParams({
            'user[login]': username,
            'user[password]': password,
        });
        const res = await axios.post('https://plex.tv/users/sign_in.json', params, {
            headers: this._headers,
        });
        this._accessToken = res.data.user.authToken;
        return { accessToken: this._accessToken };
    }

    async Get(path, optionalHeaders = {}) {
        if (this._accessToken === '')
            throw Error("No Plex token provided. Please use the SignIn method or provide a X-Plex-Token in the Plex constructor.");
        const res = await axios.get(`${this.URL}${path}`, {
            headers: { ...this._headers, 'X-Plex-Token': this._accessToken, ...optionalHeaders },
        });
        return res.data.MediaContainer;
    }

    async Put(path, query = {}, optionalHeaders = {}) {
        if (this._accessToken === '')
            throw new Error("No Plex token provided. Please use the SignIn method or provide a X-Plex-Token in the Plex constructor.")
        await axios.put(`${this.URL}${path}`, null, {
            headers: { ...this._headers, 'X-Plex-Token': this._accessToken, ...optionalHeaders },
            params: query,
        });
    }

    async Post(path, query = {}, optionalHeaders = {}) {
        if (this._accessToken === '')
            throw new Error("No Plex token provided. Please use the SignIn method or provide a X-Plex-Token in the Plex constructor.")
        const res = await axios.post(`${this.URL}${path}`, null, {
            headers: { ...this._headers, 'X-Plex-Token': this._accessToken, ...optionalHeaders },
            params: query,
        });
        return res.data;
    }

    async checkServerStatus() {
        try {
            await this.Get('/');
            return 1;
        } catch (err) {
            console.error("Error getting Plex server status", err);
            return -1;
        }
    }

    async GetDVRS() {
        try {
            var result = await this.Get('/livetv/dvrs')
            var dvrs = result.Dvr
            dvrs = typeof dvrs === 'undefined' ? [] : dvrs
            return dvrs
        } catch (err) {
            throw Error( "GET /livetv/drs failed: " + err.message);
        }
    }

    async RefreshGuide(_dvrs) {
        try {
            var dvrs = typeof _dvrs !== 'undefined' ? _dvrs : await this.GetDVRS()
            for (var i = 0; i < dvrs.length; i++) {
                await this.Post(`/livetv/dvrs/${dvrs[i].key}/reloadGuide`);
            }
        } catch (err) {
            throw Error("Zort", err);
        }
    }

    async RefreshChannels(channels, _dvrs) {
        var dvrs = typeof _dvrs !== 'undefined' ? _dvrs : await this.GetDVRS()
        var _channels = []
        let qs = {}
        for (var i = 0; i < channels.length; i++) {
            _channels.push(channels[i].number)
        }
        qs.channelsEnabled = _channels.join(',')
        for (var i = 0; i < _channels.length; i++) {
            qs[`channelMapping[${_channels[i]}]`] = _channels[i]
            qs[`channelMappingByKey[${_channels[i]}]`] = _channels[i]
        }
        for (var i = 0; i < dvrs.length; i++) {
            for (var y = 0; y < dvrs[i].Device.length; y++) {
                await this.Put(`/media/grabbers/devices/${dvrs[i].Device[y].key}/channelmap`, qs);
            }
        }
    }
}

module.exports = Plex
