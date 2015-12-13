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

/* search in the string, return true if found, false otherwise */
function contains(string,search) {
    return string.indexOf(search) > -1;
}

/* convert between different data types */
function Converter() {
    this.csvchar = ',';
};
Converter.prototype = {
    constructor: Converter,
    quoteCsv: function(str) {
        if (contains(str,'"') || contains(str,this.csvchar)) {
            str = str.replace(/"/g,'""');
        }
        return '"' + str + '"';
    },
    unquoteCsv: function(str) {
        if (str.length > 0 && str[0] === '"' && str[str.length-1] === '"') {
            str = str.replace(/""/g,'"').substring(1,str.length-1);
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
        var arr = []
        structure = structure == null? Object.keys(obj) : structure;
        for (var i = 0; i < structure.length; i++) {
            arr.push(obj[structure[i]]);
        }
        return arr;
    },
    arrayToObject: function(arr,obj,structure) {
        structure = structure == null? Object.keys(obj) : structure;
        obj = obj == null? new Object() : obj;
        for (var i = 0; i < structure.length; i++) {
            if (structure[i] == null) {
                continue;
            }
            obj[structure[i]] = arr[i];
        }
        return obj;
    }
}

/* handle exporting playlists */
function Exporter() {
};
Exporter.prototype = {
    constructor: Exporter,
    listenTo: function(ahref) {
        var exporter = this;
        ahref.addEventListener('click',function(e){exporter.export.call(exporter,e)},false)
    },
    export: function(a) {
        var doc = new XDoc(document);
        var down = doc.create('a',null,{
            'href':'data:text/plain;charset=utf-8,'+encodeURIComponent("hello"),
            'download':'playlists.csv'}).click();
    }
}

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
        input.addEventListener('change',function(e){file.read.call(file,e)},false);
    },
    /* read the select file from an input file element */
    read: function(input) {
        var file = input.target.files[0];
        if (!file) {
            return;
        }
        var reader = new FileReader();
        reader.onload = this.onload;
        reader.readAsText(file);
    }
}

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
        var results = []
        var xpathresults = document.evaluate(
            xpath,this.doc,null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE);
        for (var i = 0; i < xpathresults.snapshotLength; i++) {
            results.push(xpathresults.snapshotItem(i))
        }
        return results;
    }
}

/* a collection of songs. */
function Songlist(src) {
    this.name = null;
    this.songs = [];
    /** the google id for this playlist */
    this.id;
}
Songlist.prototype = {
    constructor: Songlist,
    /** search for the closest matching song in the list */
    search: function(song) {},
    /** output the playlist as a csv string */
    toCsv: function() {},
    /** populate the playlist from a csv string */
    fromCsv: function(csv) {},
    /** populate the list from google search results */
    fromGSearch: function(jsarray) {}
}

/* a song object for holding song info. */
function Song(src) {
    this.title = null;
    this.artist = null;
    this.album = null;
    /* track postion of song in album */
    this.track = null;
    /* this google song id */
    this.id = null;
}
Song.prototype = {
    constructor: Song,
    /* output the song as a csv string */
    toCsv: function() {},
    /* populate songinfo from a csv string */
    fromCsv: function(csv) {}
}

/* send commands to google music server */
function GMusic(src) {
    /* the session data for communication with the server */
    this.session = null;
    /* the last request sent to the server. */
    this.request = null;
    /* the callback for when results are obtained */
    this.onresponse = function() {
        console.log("results recieved");
        console.log(this.responseText);
    };
};
GMusic.prototype = {
    constructor: GMusic,
    _req: function(url,data) {
        this.request = new XMLHttpRequest();
        this.request.open("POST",url+"?format=jsarray&"+this.session.getQuery());
        this.request.addEventListener("load",this.onresponse,false);
        var postData = this.session.getPostArray();
        postData[1] = data;
        this.request.send(JSON.stringify(postData));
    },
    search: function(search_string) {
        this._req("services/search",[search_string,10,,1]);
    },
    getPlaylists: function() {
        this._req("services/loadplaylists",[]);
    },
    getPlaylistSongs : function(songlist) {
        this._req("services/loaduserplaylist",[String(songlist.id)]);
    },
    createPlaylist: function(name) {
        this._req("services/createplaylist",[false,name,null,[]]);
    },
    addToPlaylist: function(songlist) {
        // data format: ["songlistid",[["songid",tracknumber],["songid",tracknumber]...]
        this._req("services/addtrackstoplaylist",songlist.toGPlaylist())
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
    
    menu.appendChild(importui);
    menu.appendChild(exportui);
};
window.addEventListener ("load", addui, false);

var session = new SessionInfo();
session.oninit = function(s) {
    console.log("session information obtained");
    console.log(s);
    var music = new GMusic();
    music.session = s;
    music.onresponse = function() {
        console.log("top song found");
        var results = JSON.parse(this.responseText)
        var songlist = results[1][0]
        var topsong = songlist[0]
        var song = new Song();
        var conv = new Converter();
        conv.arrayToObject(topsong,song,['id','title',null,'artist','album']);
        console.log(song);
    };
    music.search("bob");
};

var tap = new XHRTap();
/* pull out session information from the clinet/server comms */
tap.sendcallback = function() {
    session.fromTap(tap);
}
tap.inject();

