// ==UserScript==
// @name         gmusic-playlist
// @namespace    https://github.com/soulfx/gmusic-playlist.js
// @version      0.151208
// @description  import and export playlists in google music
// @author       soulfx <john.elkins@yahoo.com>
// @match        https://play.google.com/music/listen*
// @grant        none
// ==/UserScript==
/* jshint -W097 */
'use strict';

/* songlist for development/debugging purposes */
var songlist = ["bad","stray cats stray cat strut","just what i needed cars","instant karma! we all shine on john lennon","thunderstruck"];

/* string utility functions */
var STRU = {
    /* search in the string, return true if found, false otherwise */
    contains: function(string, search) {
        return string.indexOf(search) > -1;
    },
    closeMatch: function(str1,str2) {
        if (str1 == null || str2 == null) {
            return false;
        }
        str1 = str1.toLowerCase().replace(/[\W_]+/g,'');
        str2 = str2.toLowerCase().replace(/[\W_]+/g,'');
        return this.contains(str1,str2) || this.contains(str2,str1);
    }
};

/* convert between different data types */
function Converter() {
    this.csvchar = ',';
}
Converter.prototype = {
    constructor: Converter,
    quoteCsv: function(str) {
        if (STRU.contains(str,'"') || STRU.contains(str,this.csvchar)) {
            str = str.replace(/"/g,'""');
            str = '"' + str + '"';
        }
        return str;
    },
    unquoteCsv: function(str) {
        if (str.length > 0 && str[0] === '"' && str[str.length-1] === '"') {
            str = str.substring(1,str.length-1);
            str = str.replace(/""/g,'"');
        }
        return str;
    },
    csvToArray: function(csv) {
        var arr = [];
        var val = '';
        var ignoreSep = false;
        for (var i = 0; i < csv.length; i++) {
            var char = csv[i];
            if (char === this.csvchar && !ignoreSep) {
                arr.push(this.unquoteCsv(val));
                val = '';
                continue;
            } else if (char === '"') {
                ignoreSep = !ignoreSep;
            }
            val += char;
        }
        arr.push(this.unquoteCsv(val));
        return arr;
    },
    arrayToCsv: function(arr) {
        var csv = '';
        for (var i=0; i < arr.length; i++) {
            csv += this.quoteCsv(String(arr[i])) + ',';
        }
        return csv.substring(0,csv.length-1);
    },
    objectToArray: function(obj,structure) {
        var arr = [];
        structure = structure == null? Object.keys(obj) : structure;
        for (var i = 0; i < structure.length; i++) {
            arr.push(obj[structure[i]]);
        }
        return arr;
    },
    arrayToObject: function(arr,obj,structure) {
        structure = structure == null? Object.keys(obj) : structure;
        obj = obj == null? {} : obj;
        for (var i = 0; i < structure.length; i++) {
            if (structure[i] == null) {
                continue;
            }
            obj[structure[i]] = arr[i];
        }
        return obj;
    }
};

/* handle exporting playlists */
function Exporter() {
}
Exporter.prototype = {
    constructor: Exporter,
    listenTo: function(ahref) {
        var exporter = this;
        ahref.addEventListener('click',function(e){exporter.export.call(exporter,e);},false);
    },
    export: function(a) {
        var music = new GMusic(session);
        
        var populateSonglists = function(songlists) {
            var lists = [];
            var populated = [];
            var addpop = function(full) {
                populated.push(full);
            };
            for (var i = 0; i < songlists.length; i++) {
                var songlist = songlists[i];
                lists.push(music.getPlaylistSongs(songlist).then(addpop));
            }
            lists.push(music.getThumbsUp().then(addpop));
            /* TODO add playlist of entire library */
            return Promise.all(lists).then(function() {
                return populated;
            });
        };
        
        var generateCsv = function(songlists) {
            var csv = '';
            var conv = new Converter();
            csv += conv.arrayToCsv(Object.keys(new Song())) + conv.csvchar + 'playlist\n';
            for (var i = 0; i < songlists.length; i++) {
                var songlist = songlists[i];
                for (var j = 0; j < songlist.songs.length; j++) {
                    var song = songlist.songs[j];
                    csv += conv.arrayToCsv(conv.objectToArray(song))
                        + conv.csvchar + conv.quoteCsv(songlist.name) + '\n';
                }
            }
            return csv;
        }
        
        music.getPlaylists().then(populateSonglists).then(generateCsv).then(function(csv){
            var doc = new XDoc(document);
            var down = doc.create('a',null,{
            'href':'data:text/plain;charset=utf-8,'+encodeURIComponent(csv),
            'download':'playlists.csv'}).click();
        });
    }
};

/* handle importing playlists */
function Importer() {
    this.onload = function(event) {
        console.log("file load complete");
        console.log(event.target.result);
    };
}
Importer.prototype = {
    constructor: Importer,
    /** register the read function on the input element */
    listenTo: function(input) {
        var file = this;
        input.addEventListener('change',function(e){file.read.call(file,e);},false);
    },
    readFile: function(file) {
        return new Promise(function(resolve,reject) {
            var reader = new FileReader();
            var onload = function(event) { resolve(event.target.result); };
            var onerror = function() { reject(Error('file error')); };
            reader.addEventListener("load",onload,false);
            reader.addEventListener("error",onerror,false);
            reader.readAsText(file);
        });
    },
    /* read the select file from an input file element */
    read: function(input) {
        var file = input.target.files[0];
        if (!file) {
            return;
        }
        function isHeader(harr) {
            return harr.indexOf('title') > -1;
        }
        function getStructures(harr) {
            var pstruct = []
            var sstruct = []
            for (var i = 0; i < harr.length; i++) {
                if (harr[i] === 'playlist') {
                    pstruct.push('name');
                    sstruct.push(null);
                } else {
                    pstruct.push(null);
                    sstruct.push(harr[i]);
                }
            }
            return {'playlist':pstruct,'song':sstruct};
        }
        /* parse the csv file and return an array of songlists */
        var parseCsv = function(csv) {
            var conv = new Converter();
            var songlistmap = {};
            var lines = csv.split('\n');
            var sstruct = Object.keys(new Song());
            var pstruct = sstruct.push('playlist');
            pstruct = getStructures(pstruct).playlist;
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                var arr = conv.csvToArray(line);
                if (i === 0 && isHeader(arr)) {
                    var structs = getStructures(arr);
                    sstruct = structs.song;
                    pstruct = structs.playlist;
                    continue;
                }
                var songlist = conv.arrayToObject(
                    arr,new Songlist(),pstruct);
                if (songlistmap[songlist.name] == null) {
                    songlistmap[songlist.name] = songlist;
                }
                songlistmap[songlist.name].songs.push(
                    conv.arrayToObject(arr,new Song(),sstruct));
            }
            var songlists = [];
            var songlistnames = Object.keys(songlistmap);
            for (var i = 0; i < songlistnames.length; i++) {
                songlists.push(songlistmap[songlistnames[i]]);
            }
            return songlists;
        }
        /* search for gmusic song ids for the songs in each song list */
        var getGMusicSongIds = function(songlists) {
            var searchTasks = [];
            for (var i = 0; i < songlists.length; i++) {
                for (var j = 0; k < songlists[i].songs.length; k++) {
                    searchTasks.push(songlists[i].songs[j].getGMusicId());
                }
            }
            return Promise.all(searchTasks).then(function() {
                return songlists;
            });
        }
        /* create playlists for the songlists */
        /* TODO */
        /* convert the songlists back to csv and provide for download, do this on
           both success and error */
        /* TODO */
        this.readFile(file).then(parseCsv).then(function(songlists){
            console.log(songlists);
        });
    }
};

/* XML document functions */
function XDoc(document) {
    this.doc = document;
}
XDoc.prototype = {
    constructor: XDoc,
    /* create a new element for the doc */
    create: function(tag,val,attrs) {
        var el = this.doc.createElement(tag);
        if (typeof val === 'string') {
            el.appendChild(this.doc.createTextNode(val));
        } else if (val && val.constructor === Array) {
            for (var i = 0; i < val.length; i++) {
                el.appendChild(val[i]);
            }
        } else if (val) {
            el.appendChild(val);
        }
        if (attrs) {
            for (var key in attrs) {
                el.setAttribute(key,attrs[key]);
            }
        }
        return el;
    },
    /* get a list of elements matching the xpath */
    search: function(xpath) {
        var results = [];
        var xpathresults = document.evaluate(
            xpath,this.doc,null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE);
        for (var i = 0; i < xpathresults.snapshotLength; i++) {
            results.push(xpathresults.snapshotItem(i));
        }
        return results;
    },
    /* create a XDoc from a string (text/html by default) */
    fromString(string,type) {
        if (type == null) {
            type = 'text/html';
        }
        var parser = new DOMParser();
        this.doc = parser.parseFromString(string,type);
        return this;
    }
};

/* a filtered list of songs*/
function Filter(initialList) {
    this.songs = initialList;
}
Filter.prototype = {
    constructor: Filter,
    apply: function(prop,val) {
        if (val == null) {
            return;
        }
        var fsongs = [];
        for (var i = 0; i < this.songs.length; i++) {
            var song = songs[i];
            if (STRU.closeMatch(song[prop],val)) {
                fsongs.push(song);
            }
        }
        if (fsongs.length > 0) {
            this.songs = fsongs;
        }
    },
    bySong: function(song) {
        var keys = Object.keys(song);
        for (var i = 0; i < keys.length; i++) {
            this.apply(keys[i],song[keys[i]]);
        }
    }
};

/* a collection of songs. */
function Songlist(name,id) {
    /* the name of the song list */
    this.name = name;
    /* the songs in the song list */
    this.songs = [];
    /** the google id for this playlist */
    this.id = id;
}
Songlist.prototype = {
    constructor: Songlist,
    /* populate songlist from the typical gmusic response */
    fromGMusic: function(response) {
        var songArr = response;
        if (response.constructor === String) {
            songArr = null;
            songArr = JSON.parse(response)[1][0];
        }
        if (!songArr) {
            return this;
        }
        for (var i = 0; i < songArr.length; i++) {
            this.songs.push(new Song().fromGMusic(songArr[i]));
        }
        return this;
    },
    /** search for the closest matching song in the list */
    search: function(target) {
        var filter = new Filter(this.songs);
        filter.bySong(target);
        if (filter.songs.length > 0) {
            return filter.songs[1];
        }
        return null;
    }
};

/* a song object for holding song info. */
function Song(src) {
    this.title = null;
    this.artist = null;
    this.album = null;
    /* track postion of song in album */
    this.track = null;
    /* this google song id */
    this.id = null;
    /** notes for this song, such as search info */
    this.notes = '';
}
Song.prototype = {
    constructor: Song,
    /* populate based on the typical gmusic array representation */
    fromGMusic: function(arr) {
        return new Converter().arrayToObject(
            arr,this,['id','title',null,'artist','album']);
    },
    /* return the id if not null, otherwise search GMusic for the id */
    getGMusicId: function(sess) {
        sess = sess == null? session : sess;
        var song = this;
        return new Promise(function(resolve,reject){
            if (song.id !== null) {
                resolve(song.id);
                return;
            }
            var music = new GMusic(sess);
        });
    }
};

/* send commands to google music server */
function GMusic(session) {
    /* the session data for communication with the server */
    this.session = session;
}
GMusic.prototype = {
    constructor: GMusic,
    _req: function(url,data) {
        var session = this.session;
        return new Promise(function(resolve,reject) {
            var request = new XMLHttpRequest();
            request.open("POST",url+"?format=jsarray&"+session.getQuery());
            var onload = function() { resolve(request.response); };
            var onerror = function() { reject(Error('network error')); };
            request.addEventListener("load",onload,false);
            request.addEventListener("error",onerror,false);
            var postData = session.getPostArray();
            postData[1] = data;
            request.send(JSON.stringify(postData));
        });
    },
    /* return a songlist of results */
    search: function(search_string) {
        return this._req("services/search",[search_string,10,null,1]).then(function(resp){
            return new Songlist(search_string+' Search Results').fromGMusic(resp);
        });
    },
    /* return a songlist of all songs in the library */
    getLibrary: function() {
        /* ...loadalltracks returns an html document
           where the library is split between multiple script
           segments
         */
        var getSongArray = function(response) {
            var songdoc = new XDoc().fromString(response);
            var songarr = [];
            var scripts = songdoc.search('//script');
            var orig_process = window.parent['slat_process']
            window.parent['slat_process'] = function(songdata) {
                songarr = songarr.concat(songdata[0]);
            }
            for (var i = 0; i < scripts.length; i++) {
                try {
                    eval(scripts[i].textContent);
                } catch (err) {}
            }
            window.parent['slat_process'] = orig_process;
            return songarr;
        }
        return this._req("services/streamingloadalltracks",[]).then(
            getSongArray).then(function(songArray){
            return new Songlist('Library').fromGMusic(songArray);
        });
    },
    /* return a songlist of thumbs up songs */
    getThumbsUp: function() {
        return this._req("services/getephemthumbsup",[]).then(function(resp){
            return new Songlist('Thumbs Up').fromGMusic(resp);
        });
    },
    /* return an array of empty songslists */
    getPlaylists: function() {
        var genSonglists = function(response){
            var arr = JSON.parse(response);
            var playlistArr = arr[1][0];
            var songlists = [];
            for (var i = 0; i < playlistArr.length; i++) {
                songlists.push(new Converter().arrayToObject(
                    playlistArr[i],new Songlist(),['id','name']));
            }
            return songlists;
        };
        return this._req("services/loadplaylists",[]).then(genSonglists);
    },
    /* return a populated songlist */
    getPlaylistSongs : function(songlist) {
        var genSonglist = function(response) {
            return new Songlist(songlist.name,songlist.id).fromGMusic(response);
        };
        return this._req("services/loaduserplaylist",[String(songlist.id)]).then(genSonglist);
    },
    /* return an empty songlist */
    createPlaylist: function(name) {
        return this._req("services/createplaylist",[false,name,null,[]]);
    },
    addToPlaylist: function(songlist) {
        // data format: ["songlistid",[["songid",tracknumber],["songid",tracknumber]...]
        return this._req("services/addtrackstoplaylist",songlist.toGPlaylist())
    }
}

/* session information needed in order to send reqs to server */
function SessionInfo(src) {
    /* the xt code, not sure exactly what this is yet */
    this.xtcode = null;
    /* the session id, is sent in posts */
    this.sessionid = null;
    /* the obfid, not sure what this is yet. */
    this.obfid = null;
    /* listener for when the session first becomes valid. */
    this.oninit = function() {
        console.log("session is valid");
    };
}
SessionInfo.prototype = {
    constructor: SessionInfo,
    isValid: function() {
        return this.xtcode !== null && this.sessionid !== null && this.obfid !== null;
    },
    getQuery: function() {
        return "u=0&xt="+this.xtcode+"&obfid="+this.obfid;
    },
    getPostArray: function() {
        return [[this.sessionid,1],null];
    },
    /* populate session info from an xhr tap */
    fromTap: function(tap) {
        if (this.isValid()) {
            return;
        }
        var qps = tap.getQueryParams();
        if ('xt' in qps && 'obfid' in qps) {
            this.xtcode = qps.xt;
            this.obfid = qps.obfid;
        }
        if (tap.method.toLowerCase() == 'post') {
            try {
                this.sessionid = JSON.parse(tap.data)[0][0];
            } catch (err) {}
        }
        if (this.isValid()) {
            if (this.oninit !== null) {
                this.oninit(this);
                this.oninit = null;
            }
        }
    }
}

/* an ajax tap to be able to peek into client/server comms */
function XHRTap(src) {
    this.method = null;
    this.url = null;
    this.data = null;
    this.sendcallback = function() {
        console.log(this.method);
        console.log(this.url);
        console.log(this.data);
    };
    this.loadcallback = null;
    this._origOpen = XMLHttpRequest.prototype.open;
    this._origSend = XMLHttpRequest.prototype.send;
}
/* credits to: http://stackoverflow.com/questions/3596583/javascript-detect-an-ajax-event */
XHRTap.prototype = {
    constructor: XHRTap,
    inject: function() {
        var tap = this;
        XMLHttpRequest.prototype.open = function(a,b) {
            if (!a) var a='';
            if (!b) var b='';
            tap._origOpen.apply(this, arguments);
            tap.method = a;
            tap.url = b;
            if (a.toLowerCase() == 'get') {
                tap.data = b.split('?');
                tap.data = tap.data[1];
            }
        };
        XMLHttpRequest.prototype.send = function(a,b) {
            if (!a) var a='';
            if (!b) var b='';
            tap._origSend.apply(this, arguments);
            if(tap.method.toLowerCase() == 'post') tap.data = a;
            if (tap.sendcallback) {
                tap.sendcallback(this);
            }
            if (tap.loadcallback) {
                this.addEventListener("load",tap.loadcallback,false);
            }
        }
    },
    getQuery: function() {
        return this.url.split("?")[1];
    },
    getQueryParams: function() {
        var params = {};
        if (this.getQuery() == null) {
            return params;
        }
        var keyVals = this.getQuery().split("&");
        for (var i = 0; i < keyVals.length; i++) {
            var keyVal = keyVals[i].split('=');
            params[keyVal[0]] = keyVal[1];
        }
        return params;
    }
}

/* wait for the UI to fully load and then insert the import/export controls */
var addui = function() {
    var ui = new XDoc(document);
    var menu = ui.search('//*[@id="playlists"]')[0];
    var inputui = ui.create('input',false,{'type':'file'});
    var importui = ui.create(
        'div',[ui.create('h4','Import Playlists'),inputui]);
    
    var exportlink = ui.create('a','Export Playlists',{'href':'#exportCSV'});
    var exportui = ui.create('div',ui.create('h4',exportlink));
    
    var exporter = new Exporter();
    exporter.listenTo(exportlink);
    var importer = new Importer();
    importer.listenTo(inputui);
    
    if (menu != null) {
        menu.appendChild(importui);
        menu.appendChild(exportui);
    } else {
        console.log('unable to locate menu element');
    }
    
    var m = new GMusic(session);
    m.search("yoko kanno i do").then(function(results) {
        console.log('obtained search response');
        console.log(results);
    }, function(Error) {
        console.log(Error);
    });
    m.getLibrary().then(function(r){
        console.log(r);
    });
};
window.addEventListener ("load", addui, false);

var session = new SessionInfo();
session.oninit = function(s) {
    console.log("session information obtained");
};

var tap = new XHRTap();
/* pull out session information from the clinet/server comms */
tap.sendcallback = function() {
    session.fromTap(tap);
}
tap.inject();


