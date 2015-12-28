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
        return String(string).indexOf(String(search)) > -1;
    },
    closeMatch: function(str1,str2) {
        if (str1 == null || str2 == null) {
            return false;
        }
        str1 = String(str1).toLowerCase().replace(/[\W_]+/g,'');
        str2 = String(str2).toLowerCase().replace(/[\W_]+/g,'');
        if (str1 === '' && str2 !== '' || str2 === '' && str1 !== '') {
            return false;
        }
        var sizeratio = str1.length/str2.length;
        if (sizeratio < .5 || sizeratio > 2) {
            return false;
        }
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
        if (str === 'null' || str === '') {
            str = null;
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
    },
    update: function(orig,update) {
        var keys = Object.keys(orig);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (orig[key] == null && update[key] != null) {
                orig[key] = update[key];
            }
        }
        return orig;
    },
    clone: function(src,dest) {
        dest = dest == null? new src.constructor() : dest;
        return this.arrayToObject(this.objectToArray(src),dest);
    }
};

/* handle exporting playlists */
function Exporter(filename) {
}
Exporter.prototype = {
    constructor: Exporter,
    listenTo: function(ahref) {
        var exporter = this;
        ahref.addEventListener('click',function(e){exporter.export.call(exporter,e);},false);
    },
    /* return a csv string for the given songlists */
    generateCsv: function(songlists) {
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
    },
    /* trigger a download file for the given csv text */
    downloadCsv: function(csv,filename) {
        var doc = new XDoc(document);
        var down = doc.create('a',null,{
            'href':'data:text/plain;charset=utf-8,'+encodeURIComponent(csv),
            'download':filename}).click();
    },
    export: function(a) {
        var exporter = this;
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
            lists.push(music.getLibrary().then(addpop));
            return Promise.all(lists).then(function() {
                return populated;
            });
        };
        
        music.getPlaylists().then(populateSonglists).then(function(songlists){
            exporter.downloadCsv(exporter.generateCsv(songlists),'playlists_export.csv');
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
                if (harr[i].trim() === 'playlist') {
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
            var pstruct = Object.keys(new Song());
            pstruct.push('playlist');
            pstruct = getStructures(pstruct).playlist;
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                if (line === '') {
                    continue;
                }
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
                for (var j = 0; j < songlists[i].songs.length; j++) {
                    searchTasks.push(songlists[i].songs[j].getGMusicId());
                }
            }
            return Promise.all(searchTasks).then(function() {
                return songlists;
            });
        }
        /* create playlists for the songlists */
        var createGMusicPlaylists = function(songlists) {
            var createTasks = [];
            for (var i = 0; i < songlists.length; i++) {
                var songlist = songlists[i];
                createTasks.push(songlist.toGMusic());
            }
            return Promise.all(createTasks).then(function() {
                return songlists;
            });
        }
        /* convert the songlists back to csv and provide for download */
        var exporter = new Exporter();
        this.readFile(file).then(parseCsv).then(getGMusicSongIds)
            .then(createGMusicPlaylists).then(function(songlists){
            exporter.downloadCsv(exporter.generateCsv(songlists),'playlists_import.csv');
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
    this.songs = [];
    var conv = new Converter();
    for (var i = 0; i < initialList.length; i++) {
        this.songs.push(conv.clone(initialList[i]));
    }
}
Filter.prototype = {
    constructor: Filter,
    /* filter out duplicates */
    rmDuplicates: function() {
        var map = {};
        var cleaned = [];
        for (var i = 0; i < this.songs.length; i++) {
            var key = this.songs[i].artist +
                this.songs[i].title +
                this.songs[i].album +
                this.songs[i].track;
            if (!(key in map)) {
                map[key] = true;
                cleaned.push(this.songs[i]);
            }
        }
        this.songs = cleaned;
        return this;
    },
    _apply: function(prop,val) {
        if (val == null) {
            return;
        }
        var fsongs = [];
        for (var i = 0; i < this.songs.length; i++) {
            var song = this.songs[i];
            if (STRU.closeMatch(song[prop],val)) {
                
                song.notes += prop+":";
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
            this._apply(keys[i],song[keys[i]]);
        }
        return this;
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
    /** create a GMusic playlist from this songlist */
    toGMusic: function(sess) {
        var songlist = this;
        if (songlist.id != null) {
            return new Promise(function(res,rej){res(songlist.id);});
        }
        sess = sess == null? session : sess;
        var music = new GMusic(sess);
        /* TODO support playlist splitting for 1k+ playlists */
        return music.createPlaylist(songlist.name).then(function(id){
            songlist.id = id;
            return music.addToPlaylist(songlist);
        });
    },
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
    /* the google song id type */
    this.idtype = null;
    /* the number of times this song has been played */
    this.playcount = null;
    /* the year this song was published */
    this.year = null;
    /* the genre of the song */
    this.genre = null;
    /** notes for this song, such as search info */
    this.notes = '';
}
Song.prototype = {
    constructor: Song,
    toString: function() {
        return JSON.stringify(this);
    },
    /* populate based on the typical gmusic array representation */
    fromGMusic: function(arr) {
       var song = this;
       /* TODO add rating */
       new Converter().arrayToObject(
            arr,song,[null,'title',       null,'artist','album',null,null,null,    null,null,
                      null,'genre',       null,    null,'track',null,null,null,    'year',null,
                      null,   null,'playcount',    null,   null,null,null,null,    'id','idtype']);
        if (song.id == null) {
            song.id = arr[0];
        }
        return song;
    },
    /* return the id if not null, otherwise search GMusic for the id,
       if search fails to find a result null will be returned. */
    getGMusicId: function(sess) {
        var song = this;
        if (song.id !== null) {
            return new Promise(function(res,rej){res(song.id);});
        }
        sess = sess == null? session : sess;
        var music = new GMusic(sess);
        return new Promise(function(res,rej){
            music.search(song).then(function(filter){
                if (filter.songs.length > 0) {
                    song.notes = filter.songs.length +
                        ' results match ' + filter.songs[0].notes;
                    new Converter().update(song,filter.songs[0]);
                }
                res(song.id);
            });
            /* TODO if no song.id, perform another search with
               stripped out (),{},[],<> */
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
    /* return a songlist of songs from the service based on search_string */
    searchService: function(search_string) {
        return this._req("services/search",[search_string,10,null,1]).then(function(resp){
            return new Songlist(search_string+' search results').fromGMusic(resp);
        });
    },
    /* return a filtered list of songs based on the given song */
    search: function(song) {
        var processes = [];
        var songs = [];
        var gmusic = this;
        var search_string = song.artist == null? '' : song.artist;
            search_string += song.title == null? '' : ' '+song.title;
        processes.push(gmusic.getLibrary().then(
            function(slist){songs = songs.concat(slist.songs)}));
        processes.push(gmusic.searchService(search_string).then(
            function(slist){songs = songs.concat(slist.songs)}));
        return Promise.all(processes).then(function() {
            return new Filter(songs).bySong(song).rmDuplicates();
        });
    },
    /* return a songlist of all songs in the library */
    getLibrary: function() {
        var gmusic = this;
        var session = gmusic.session;
        if (session.libraryCache != null) {
            return new Promise(function(resolve,reject){
                resolve(session.libraryCache);
            });
        }
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
            session.libraryCache = new Songlist('Library').fromGMusic(songArray);
            return session.libraryCache;
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
    /* return an new empty songlist id with the given name */
    createPlaylist: function(name) {
        var returnId = function(response) {
            return JSON.parse(response)[1][0];
        }
        return this._req("services/createplaylist",[false,name,null,[]]).then(returnId);
    },
    addToPlaylist: function(songlist) {
        var playlist = [songlist.id,[]];
        var psongs = playlist[1];
        for (var i = 0; i < songlist.songs.length; i++) {
            var song = songlist.songs[i];
            if (song.id != null) {
                psongs.push([song.id,Number(song.idtype)]);
            }
        }
        return this._req("services/addtrackstoplaylist",playlist);
    }
}

/* session information needed in order to send reqs to server */
function SessionInfo(src) {
    /* the library cache */
    this.libraryCache = null;
    /* the xt code, not sure exactly what this is yet */
    this.xtcode = null;
    /* the session id, is sent in posts */
    this.sessionid = null;
    /* the obfid, not sure what this is yet. */
    this.obfid = null;
    /* listener for when the session first becomes valid. */
    this.oninit = function() {
        new GMusic(this).getLibrary().then(function(songlist){
            console.log('session active. '+songlist.songs.length+' songs loaded. ');
        });
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
    //var menu = ui.search('//*[@id="playlists"]')[0];
    var menu = ui.search('//div[@class="nav-section-divider"]')[0];
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
};
window.addEventListener ("load", addui, false);

var session = new SessionInfo();

var tap = new XHRTap();
/* pull out session information from the clinet/server comms */
tap.sendcallback = function() {
    session.fromTap(tap);
}
tap.inject();


