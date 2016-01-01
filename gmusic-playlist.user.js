// ==UserScript==
// @name         gmusic-playlist
// @namespace    https://github.com/soulfx/gmusic-playlist.js
// @version      0.160101
// @description  import and export playlists in google music
// @author       soulfx <john.elkins@yahoo.com>
// @match        https://play.google.com/music/listen*
// @grant        none
// ==/UserScript==
/* jshint -W097 */
'use strict';

function Log() {
    /* 0 - n console log level, higher levels are more verbose.
       0 disables console logging */
    this.level = 1;
    /* an element to write one line status entries via innerHTML */
    this.status = null;
    /* display the stack for each log output */
    this.showStack = false;
    /* overall progress text */
    this.progress = '';
}
Log.prototype = {
    constructor: Log,
    /* update the log */
    up: function() {
        var lg = this;
        if (!arguments.length) return;
        if (lg.status && arguments[0]) {
            var msg = arguments[0];
            setTimeout(function(){
                lg.status.innerHTML = lg.progress + msg;
            },1);
        }
        if (!lg.level) return;
        var cout = [];
        [].slice.call(arguments,0,lg.level).forEach(function(arg){
            if (arg) cout.push(arg);
        });
        if (this.showStack) cout.push(
            new Error().stack.split('\n').slice(2).join('\n'));
        if (cout.length) console.log(cout);
    }
};
/* global level log variable */
var log = new Log();

/* string utility functions */
var STRU = {
    /* words that contain an * in them */
    wildWords: /\w*(\*+)\w*/g,
    brackets: /\[.*?\]|\(.*?\)|\{.*?\}|\<.*?\>/g,
    nonWordChars: /[\W_]+/g,
    startswith: function(string, prefix) {
        if (!prefix || !string) return false;
        return string.slice(0, prefix.length) === prefix;
    },
    /* search in the string, return true if found, false otherwise */
    contains: function(string, search) {
        return String(string).indexOf(String(search)) > -1;
    },
    closeMatch: function(str1,str2) {
        if (!str1 || !str2) {
            return false;
        }
        var reg1 = String(str1).toLowerCase().replace(
            STRU.nonWordChars,'');
        var reg2 = String(str2).toLowerCase().replace(
            STRU.nonWordChars,'');
        if (reg1 === '' && reg2 !== '' || reg1 === '' && reg2 !== '') {
            return false;
        }
        var sizeratio = reg1.length/reg2.length;
        if ((sizeratio < 0.5 || sizeratio > 2) &&
            (!String(str1).match(STRU.brackets) || !String(str1).match(STRU.brackets))) {
            return false;
        }
        /* on the fly regex compilation is just too slow */
        //return str1.match(new RegExp(reg2s,'gi')) || str2.match(new RegExp(reg1s,'gi'));
        return this.contains(reg1,reg2) || this.contains(reg2,reg1);
    },
    /* left padd a number
    http://stackoverflow.com/a/10073788/5648123
    */
    pad: function(num, width, pchar) {
        pchar = pchar || '0';
        num = String(num);
        return num.length >= width ?
            num : new Array(width - num.length+1).join(pchar)+num;
    }
};

/* convert between different data types */
function Converter(other) {
    this.csvchar = ',';
    /* object keys with this prefix will be ignored
    and treated as transient */
    this.tprefix = '_';
    var my = this;
    other && Object.keys(other).forEach(function(key) {
        my[key] = other[key];
    });
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
        var conv = this;
        [].slice.call(csv).forEach(function(char){
            if (char === conv.csvchar && !ignoreSep) {
                arr.push(conv.unquoteCsv(val));
                val = '';
                return;
            } else if (char === '"') {
                ignoreSep = !ignoreSep;
            }
            val += char;
        });
        arr.push(conv.unquoteCsv(val));
        return arr;
    },
    arrayToCsv: function(arr) {
        var csv = '';
        var conv = this;
        arr.forEach(function(val){
            csv += conv.quoteCsv(String(val)) + ',';
        });
        return csv.substring(0,csv.length-1);
    },
    struct: function(obj) {
        var struct = [];
        var conv = this;
        Object.keys(obj).forEach(function(key){
            if (STRU.startswith(key,conv.tprefix)) return;
            struct.push(key);
        });
        return struct;
    },
    objectToArray: function(obj,structure) {
        var arr = [];
        var conv = this;
        structure = structure || conv.struct(obj);
        structure.forEach(function(key){
            arr.push(obj[key]);
        });
        return arr;
    },
    arrayToObject: function(arr,obj,structure) {
        var conv = this;
        structure = structure || conv.struct(obj);
        obj = !obj? {} : obj;
        var conv = this;
        structure.forEach(function(key,idx){
            if (!key) return;
            obj[key] = arr[idx];
        });
        return obj;
    },
    update: function(orig,update) {
        var keys = Object.keys(orig);
        keys.forEach(function(key){
            if (!orig[key] && update[key]) {
                orig[key] = update[key];
            }
        });
        return orig;
    },
    clone: function(src,dest) {
        dest = !dest? new src.constructor() : dest;
        return this.arrayToObject(this.objectToArray(src),dest);
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
    /* return a csv string for the given songlists */
    generateCsv: function(songlists) {
        var csv = '';
        var conv = new Converter();
        csv += conv.arrayToCsv(conv.struct(new Song())) + conv.csvchar + 'playlist\n';
        songlists.forEach(function(songlist){
            songlist.songs.forEach(function(song){
                csv += conv.arrayToCsv(conv.objectToArray(song)) +
                    conv.csvchar + conv.quoteCsv(songlist.name) + '\n';
            });
        });
        log.up('generated csv for '+songlists.length+' playlists',null,csv);
        return csv;
    },
    /* trigger a download file for the given csv text */
    downloadCsv: function(csv,filename) {
        /* use blob to overcome href data limits */
        var blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
        var url = URL.createObjectURL(blob);
        var doc = new XDoc(document);
        var down = doc.create('a',null,{
            'href':url,'download':filename}).click();
        /* TODO may need to call revokeOjectURL to clean up mem */
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
            songlists.forEach(function(songlist){
                lists.push(music.getPlaylistSongs(songlist).then(addpop));
            });
            lists.push(music.getThumbsUp().then(addpop));
            lists.push(music.getLibrary().then(addpop));
            log.up('queued up '+lists.length+' playlists for download');
            return Promise.all(lists).then(function() {
                var totalSongs = 0;
                populated.forEach(function(plist){
                    totalSongs += plist.songs.length;
                });
                log.progress = totalSongs + ' songs. ';
                log.up('obtained '+populated.length+' playlists',populated);
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
        log.up('preparing to read file',file);
        return new Promise(function(resolve,reject) {
            var reader = new FileReader();
            var onload = function(event) {resolve(event.target.result); };
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
            log.up('file is not valid');
            return;
        }
        function isHeader(harr) {
            log.up('checking for header',harr);
            return harr.indexOf('title') > -1;
        }
        function getStructures(harr) {
            var pstruct = [];
            var sstruct = [];
            harr.forEach(function(header){
                if (header.trim() === 'playlist') {
                    pstruct.push('name');
                    sstruct.push(null);
                } else {
                    pstruct.push(null);
                    sstruct.push(header);
                }
            });
            var hstructs = {'playlist':pstruct,'song':sstruct};
            log.up('returning header structures',hstructs);
            return hstructs;
        }
        /* parse the csv file and return an array of songlists */
        var parseCsv = function(csv) {
            var conv = new Converter();
            var songlistmap = {};
            var lines = csv.split('\n');
            var sstruct = conv.struct(new Song());
            var pstruct = conv.struct(new Song());
            pstruct.push('playlist');
            pstruct = getStructures(pstruct).playlist;
            lines.forEach(function(line,i){
                line = line.replace(/\r/g,'');
                if (line === '') return;
                var arr = conv.csvToArray(line);
                if (i === 0 && isHeader(arr)) {
                    var structs = getStructures(arr);
                    sstruct = structs.song;
                    pstruct = structs.playlist;
                    return;
                }
                var songlist = conv.arrayToObject(
                    arr,new Songlist(),pstruct);
                if (!songlist.name) {
                    songlist.name = new Date().toString(
                    ).split(' ').splice(0,4).join(' ');
                }
                if (!songlistmap[songlist.name]) {
                    songlistmap[songlist.name] = songlist;
                }
                songlistmap[songlist.name].songs.push(
                    conv.arrayToObject(arr,new Song(),sstruct));
            });
            var songlists = [];
            var songlistnames = Object.keys(songlistmap);
            songlistnames.forEach(function(name){
                songlists.push(songlistmap[name]);
            });
            log.up('parsed '+songlists.length+' playlists',songlists);
            return songlists;
        };
        /* search for gmusic song ids for the songs in each song list */
        var getGMusicSongIds = function(songlists) {
            var searchTasks = [];
            var songcount = 0;
            var progress = function(){return songcount + '/' + searchTasks.length + ' songs. ';};
            songlists.forEach(function(songlist){
                songlist.songs.forEach(function(song){
                    searchTasks.push(
                        song.getGMusicId().then(function(){
                        if (song.id) {
                            ++songcount;
                        }
                        log.progress = progress();
                        log.up(song.title,"search complete",song);
                    }));
                });
            });
            log.progress = progress();
            log.up('searching...');
            return Promise.all(searchTasks).then(function() {
                log.up('song search complete for ' +
                       songlists.length+' playlists',songlists);
                return songlists;
            },function(err){log.up('error',err)});
        };
        /* create playlists for the songlists */
        var createGMusicPlaylists = function(songlists) {
            var createTasks = [];
            var createdlists = [];
            songlists.forEach(function(songlist){
                createTasks.push(songlist.toGMusic().then(
                    function(gmusiclists){
                        createdlists = createdlists.concat(gmusiclists);
                    }));
            });
            log.up('creating '+createTasks.length+' playlists');
            return Promise.all(createTasks).then(function() {
                log.up('created '+createdlists.length+' playlists',createdlists);
                return createdlists;
            });
        };
        /* convert the songlists back to csv and provide for download */
        var exporter = new Exporter();
        this.readFile(file).then(parseCsv).then(getGMusicSongIds)
            .then(createGMusicPlaylists).then(function(gmusiclists){
            exporter.downloadCsv(exporter.generateCsv(gmusiclists),'playlists_import.csv');
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
        log.up('searching for xpath'+xpath);
        return results;
    },
    /* create a XDoc from a string (text/html by default) */
    fromString(string,type) {
        if (!type) {
            type = 'text/html';
        }
        var parser = new DOMParser();
        this.doc = parser.parseFromString(string,type);
        return this;
    }
};

/* promise async loop traversal */
function ALooper(arr) {
    this.arr = arr;
    this.chunk = 50;
}
ALooper.prototype = {
    constructor: ALooper,
    /* provide loop and resolve callbacks */
    forEach: function(lcb,rcb) {
        var looper = this;
        return new Promise(function(resolve,rej){
            var i = 0;
            (function iterator() {
            if (!(i < looper.arr.length)) {
                resolve(rcb); return;
            }
            var val = looper.arr[i++];
            lcb(val,i,looper.arr);
            (i%looper.chunk)? iterator() : setTimeout(iterator,1);
            })();
        });
    }
}

/* a filtered list of songs*/
function Filter(initialList) {
    this.songs = initialList;
    this.hasMatch = false;
    /* key is a property,
    value is true or false if the property had a match */
    this.match = {};
}
Filter.prototype = {
    constructor: Filter,
    _apply: function(prop,val,exact) {
        var filter = this;
        if (!val) {
            return new Promise(function(res,rej){res(filter)});
        }
        var fsongs = [];
        return new ALooper(filter.songs).forEach(function(song,sidx){
            var match = (exact)? song[prop] === val : STRU.closeMatch(song[prop],val);
            if (match) {
                var fsong = new Converter({'tprefix':null}).clone(song);
                fsongs.push(fsong);
                filter.match[prop] = true;
            }
        }).then(function(){
            if (fsongs.length > 0) {
                filter.hasMatch = true;
                filter.songs = fsongs;
            }
            log.up(null,null,null,'applyed filter '+prop+':'+val,filter);
            return filter;
        });
    },
    removeDuplicates: function() {
        var filter = this;
        var unique = {};
        return new ALooper(filter.songs).forEach(function(song){
            if (!unique[song.id]) unique[song.id] = song;
        }).then(function(){
            filter.songs = [];
            Object.keys(unique).forEach(function(key){
                filter.songs.push(unique[key]);
            });
            return filter;
        });
    },
    byExactSong: function(song) {
        return this.bySong(song,true);
    },
    bySong: function(song,exactMatch) {
        exactMatch = exactMatch || false;
        var keys = Object.keys(song);
        var filter = this;
        var filters = [];
        
        /* apply the filters one after another asyncly */
        return new Promise(function(resolve,rej){
            var keyidx = 0;
            (function iterator() {
                if (!(keyidx < keys.length)) {            
                    log.up(null,null,null,'filter complete for '+song.title,filter);
                    resolve(filter); return;
                }
                var key = keys[keyidx++];
                filter._apply(key,song[key],exactMatch).then(function(){
                    iterator();
                });
            })();
        });
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
    /* split this songlist into multiple lists */
    split: function(splitSize) {
        var songlist = this;
        var splitSonglists = [];
        for (var i = 0; i < songlist.songs.length; i = i + splitSize) {
            var splitlist = new Songlist(songlist.name + ' Part ' +
                                         (Math.floor(i/splitSize) + 1));
            splitlist.songs = songlist.songs.slice(i,i+splitSize);
            splitSonglists.push(splitlist);
        }
        if (splitSonglists.length < 2) {
            splitSonglists = [songlist];
        }
        log.up('split songlist',splitSonglists);
        return splitSonglists;
    },
    /* create GMusic playlists from this songlist */
    toGMusic: function(sess) {
        var songlist = this;
        if (songlist.id) {
            log.up('has google id',songlist);
            return new Promise(function(res,rej){res([songlist]);});
        }
        sess = !sess? session : sess;
        var music = new GMusic(sess);
        log.up('creating playlist',songlist);
        return music.createPlaylist(songlist);
    },
    /* populate songlist from the typical gmusic response */
    fromGMusic: function(response) {
        var songlist = this;
        var addsng = function(sng,top) {
            if (!sng) return;
            top = top || false;
            var song = new Song().fromGMusic(sng);
            if (!song.id) return;
            song._gsuggested = top;
            songlist.songs.push(song);
        };
        if (response.constructor === String) {
            var arr = JSON.parse(response);
            /* the usual list of found songs */
            arr[1][0] && arr[1][0].forEach(function(sng) {
                addsng(sng);
            });
            /* top suggested songs */
            arr[1][3] && arr[1][3].forEach(function(sng){
                addsng(sng,true);
            });
            if (arr[1][4]) addsng(arr[1][4],true);
        } else {
            response.forEach(function(song){
                addsng(song);
            });
        }
        log.up(null,'loaded '+this.name,this);
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
    /** duration of the song */
    this.duration = null;
    /* this google song id */
    this.id = null;
    /* the google song id type 1 (free/purcahsed),
       2 (uploaded/non matched), 6 (uploaded/matched), * (other)  */
    this.idtype = null;
    /* the number of times this song has been played */
    this.playcount = null;
    /* the rating of a song, 1 (down) 5 (up) */
    this.rating = null;
    /* the year this song was published */
    this.year = null;
    /* the genre of the song */
    this.genre = null;
    /** notes for this song, such as search info */
    this.notes = '';
    /** if this song was suggested as a top match by google */
    this._gsuggested = false;
}
Song.prototype = {
    constructor: Song,
    toString: function() {
        return JSON.stringify(this);
    },
    /* populate based on the typical gmusic array representation */
    fromGMusic: function(arr) {
       var song = this;
       new Converter().arrayToObject(
            arr,song,[null,'title',       null,'artist','album',null,null,null,    null,null,
                      null,'genre',       null,    'duration','track',null,null,null,    'year',null,
                      null,   null,'playcount',    'rating',   null,null,null,null,    'id','idtype']);
        /* use the unique ID for non all access (personal) songs */
        if (!song.id || song.idtype === 2 || song.idtype === 6 || song.idtype === 1) {
            song.id = arr[0];
        }
        log.up(null,null,null,'loaded song '+song.title,[song,arr]);
        return song;
    },
    /* return the id if not null, otherwise search GMusic for the id,
       if search fails to find a result null will be returned. */
    getGMusicId: function(sess) {
        var song = this;
        if (song.id) {
            return new Promise(function(res,rej){res(song.id);});
        }
        sess = !sess? session : sess;
        var music = new GMusic(sess);
        log.up(null,'looking for song id for '+song.title,song);
        return music.search(song).then(function(filter){
            log.up(null,song.title+' search complete',[song,filter]);
            if (filter.hasMatch) {
                song.notes = STRU.pad(filter.songs.length,2) +
                    ' results match ';
                Object.keys(filter.match).forEach(function(key){
                    song.notes += key+':';
                });
                new Converter().update(song,filter.songs[0]);
            }
            log.up(null,null,null,song.title+' id search complete');
            return song.id;
        },function(err){log.up(err)});
    }
};

/* send commands to google music server */
function GMusic(session) {
    /* the session data for communication with the server */
    this.session = session;
}
GMusic.prototype = {
    constructor: GMusic,
    _req: function(url,data,passthrough) {
        var session = this.session;
        return new Promise(function(resolve,reject) {
            var request = new XMLHttpRequest();
            request.open("POST",url+"?format=jsarray&"+session.getQuery());
            var onload = function() {
                var rval = passthrough ? [request.response,passthrough] : request.response;
                resolve(rval);
            };
            var balancedload = function() { setTimeout(onload,1); };
            var onerror = function() { reject(Error('network error')); };
            request.addEventListener("load",balancedload,false);
            request.addEventListener("error",onerror,false);
            var postData = session.getPostArray();
            postData[1] = data;
            request.send(JSON.stringify(postData));
        });
    },
    /* return a songlist of songs from the service based on search_string */
    searchService: function(search_string) {
        var gmusic = this;
        return this._req("services/search",[search_string,10,null,1]).then(function(resp){
            var resultlist = new Songlist(search_string+' search results').fromGMusic(resp);
            if (!resultlist.songs.length) {
                var suggestion = JSON.parse(resp)[1][10];
                if (suggestion) {
                    log.up(null,'retrying search using suggestion '+suggestion,[resp]);
                    return gmusic.searchService(suggestion);
                }
            }
            log.up(null,'recieved search response for '+search_string,[resp,resultlist]);
            return resultlist;
        });
    },
    /* return a filtered list of songs based on the given song */
    search: function(song) {
        song._gsuggested = true;
        var processes = [];
        var songs = [];
        var gmusic = this;
        var search_string = function(song){
            var string = !song.artist? '' : song.artist;
            string += !song.title? '' : ' '+song.title;
            return string;
        };
        var bless = new Song();
        var hasBrackets = false;
        Object.keys(song).forEach(function(key){
            if (!song[key]) return;
            var src = String(song[key]);
            bless[key] = src.replace(STRU.brackets,'');
            if (bless[key] !== src) {
                hasBrackets = true;
            }
        });
        processes.push(gmusic.getLibrary().then(
            function(slist){songs = songs.concat(slist.songs);}));
        processes.push(gmusic.searchService(search_string(song)).then(
            function(slist){songs = songs.concat(slist.songs);}));
        if (hasBrackets) {
            log.up(null,'performing extra search for bracketless version '+bless.title,bless);
            processes.push(gmusic.searchService(search_string(bless)).then(
            function(slist){songs = songs.concat(slist.songs);}));
        }
        var createFilter = function() {
            return new Filter(songs);
        };
        var filterResults = function(filter) {
            return filter.bySong(song);
        };
        var filterBrackets = function(filter) {
            if (hasBrackets && !filter.match['title'] ) {
                    filter.bySong(bless);
            }
            return filter;
        }
        /* explicity titled songs sometimes have *'s in them */
        var filterWildChars = function(filter) {
            if (!filter.match['title'] && song.title.match(STRU.wildWords)) {
                var tame = new Converter({'tprefix':null}).clone(song);
                tame.title = song.title.replace(STRU.wildWords,'');
                filter.bySong(tame);
            }
            return filter;
        }
        /* attempt to get an exact match */
        var findExactMatch = function(filter) {
            if (!filter.match['title']) return filter;
            return filter.byExactSong(song);
        }
        var removeDuplicates = function(filter) {
            if (filter.hasMatch) {
                filter.removeDuplicates();
            }
            return filter;
        }
        return Promise.all(processes).then(createFilter).then(
            filterResults).then(
            filterBrackets).then(
            filterWildChars).then(
            findExactMatch).then(
            removeDuplicates);
    },
    /* return a songlist of all songs in the library */
    getLibrary: function() {
        var gmusic = this;
        var session = gmusic.session;
        if (session.libraryCache) {
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
            var orig_process = window.parent.slat_process;
            window.parent.slat_process = function(songdata) {
                songarr = songarr.concat(songdata[0]);
            };
            scripts.forEach(function(script){
                try {
                    eval(script.textContent);
                } catch (err) {}
            });
            window.parent.slat_process = orig_process;
            return songarr;
        };
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
            playlistArr.forEach(function(playlist){
                songlists.push(new Converter().arrayToObject(
                    playlist,new Songlist(),['id','name']));
            });
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
    /* create gmusic playlists from the songlist */
    createPlaylist: function(songlist) {
        var gmusic = this;
        var lists = songlist.split(1000);
        
        var createEmptyPlaylist = function(list) {
            log.up('creating empty '+list.name+' playlist');
            return gmusic._req("services/createplaylist",[false,list.name,null,[]],list);
        };
        var updateListId = function(respList) {
            var list = respList[1];
            var id = JSON.parse(respList[0])[1][0];
            list.id = id;
            log.up('updated '+list.name+' id',list);
            return list;
        };
        var updatePlaylist = function(plist) {
            log.up('updated '+plist.name+' songs',plist);
            return gmusic.addToPlaylist(plist);
        };

        var tasks = [];
        lists.forEach(function(list){
            tasks.push(createEmptyPlaylist(list).then(
                updateListId).then(updatePlaylist));
        });
        return Promise.all(tasks).then(function(){
            log.up('created '+lists.length+' playlists',lists);
            return lists;
        });
    },
    addToPlaylist: function(songlist) {
        var playlist = [songlist.id,[]];
        var psongs = playlist[1];
        songlist.songs.forEach(function(song){
            if (song.id) {
                psongs.push([song.id,Number(song.idtype)]);
            }
        });
        log.up('adding tracks to '+songlist.name,[songlist,playlist]);
        return this._req("services/addtrackstoplaylist",playlist);
    }
};

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
        return this.xtcode && this.sessionid && this.obfid;
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
            if (this.oninit) {
                this.oninit(this);
                this.oninit = null;
            }
        }
    }
};

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
            if (!a) a ='';
            if (!b) b ='';
            tap._origOpen.apply(this, arguments);
            tap.method = a;
            tap.url = b;
            if (a.toLowerCase() == 'get') {
                tap.data = b.split('?');
                tap.data = tap.data[1];
            }
        };
        XMLHttpRequest.prototype.send = function(a,b) {
            if (!a) a ='';
            if (!b) b ='';
            tap._origSend.apply(this, arguments);
            if(tap.method.toLowerCase() == 'post') tap.data = a;
            if (tap.sendcallback) {
                tap.sendcallback(this);
            }
            if (tap.loadcallback) {
                this.addEventListener("load",tap.loadcallback,false);
            }
        };
    },
    getQuery: function() {
        return this.url.split("?")[1];
    },
    getQueryParams: function() {
        var params = {};
        if (!this.getQuery()) {
            return params;
        }
        var keyVals = this.getQuery().split("&");
        for (var i = 0; i < keyVals.length; i++) {
            var keyVal = keyVals[i].split('=');
            params[keyVal[0]] = keyVal[1];
        }
        return params;
    }
};

/* wait for the UI to fully load and then insert the import/export controls */
var addui = function() {
    var ui = new XDoc(document);
    var menu = ui.search('//div[@class="nav-section-divider"]')[0];
    var inputui = ui.create('input',false,{'type':'file'});
    var importui = ui.create(
        'div',[ui.create('h4','Import Playlists'),inputui]);
    
    var exportlink = ui.create('a','Export Playlists',{'href':'#exportCSV'});
    var exportui = ui.create('div',ui.create('h4',exportlink));
    
    var statusout = ui.create('h6','ready');
    var statusui = ui.create('div',[statusout]);
    log.status = statusout;
    
    var exporter = new Exporter();
    exporter.listenTo(exportlink);
    var importer = new Importer();
    importer.listenTo(inputui);
    
    if (menu) {
        menu.appendChild(importui);
        menu.appendChild(exportui);
        menu.appendChild(statusui);
    } else {
        log.up('unable to locate menu element');
    }
};
window.addEventListener ("load", addui, false);

var session = new SessionInfo();

var tap = new XHRTap();
/* pull out session information from the clinet/server comms */
tap.sendcallback = function() {
    session.fromTap(tap);
};
tap.inject();
