function Assert() {
}
Assert.prototype = {
    constructor: Assert,
    equal: function(actual,expected,errormsg) {
        errormsg = errormsg == null? '' : errormsg;
        if (actual != expected) {
            throw new Error('!ERROR '+ errormsg
                + ': expected ['+ expected + '] but was ['+actual+']');
        }
    }
}
var assert = new Assert();

function Log() {
    this.output = '';
}
Log.prototype = {
    constructor: Log,
    out : function(str,end) {
        end = end == null? '\n' : end;
        this.output += str + end;
    }
}
var log = new Log();

function testFilter() {
    log.out('testing Filter...');
    log.out('done');
}

function testSTRU() {
    log.out('testing STRU...');

    log.out('testing closeMatch...')
    assert.equal(STRU.closeMatch('',''),true);
    assert.equal(STRU.closeMatch('',null),false);
    assert.equal(STRU.closeMatch(null,null),false);
    assert.equal(STRU.closeMatch('Happy Days',' Happy {Days}'),true);
    assert.equal(STRU.closeMatch('srv and double trouble','srv'),true);
    assert.equal(STRU.closeMatch('srv','srv and double trouble'),true);
    assert.equal(STRU.closeMatch('asdf','1234'),false);

    log.out('done');
}


function testSonglist() {
    log.out('testing songlist...');
    var slist = new Songlist();

    log.out('testing search...');

    log.out('done');
}

function testConverter() {
    log.out('testing converter...');
    var conv = new Converter();

    log.out('testing csv conversions...');
    var arr = ['one','two,three','"four','five"','six,"seven",eight'];
    log.out(arr);
    var csv = conv.arrayToCsv(arr);
    log.out(csv);
    var rarray = conv.csvToArray(csv);
    log.out(rarray);
    for (var i = 0; i < arr.length; i++) {
        assert.equal(rarray[i],arr[i],"csv conversion mismatch");
    }

    log.out('testing object/array conversions...');
    var obj = {'one':'ONE','two':'TWO','three':'THREE'};
    var objKeys = Object.keys(obj);
    log.out(JSON.stringify(obj));
    arr = conv.objectToArray(obj);
    var robj = {'one':null,'two':null,'three':null};
    var robj = conv.arrayToObject(arr,robj)
    log.out(JSON.stringify(robj));
    for (var i = 0; i < objKeys.length; i++) {
        assert.equal(robj[objKeys[i]],obj[objKeys[i]],"object conversion mismatch");
    }
    log.out('done');
}

function runTests() {
    try {
        testSTRU();
        testConverter();
        testSonglist();
    } catch (e) {
        log.out(e.message);
    }
    document.getElementById('output').innerHTML = log.output;
}
window.addEventListener("load",runTests,false);
