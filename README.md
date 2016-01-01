gmusic-playlist.js
===============

javascript based playlist scripts for gmusic

## prerequisites
 
 - greasemonkey addon for your browser
  - chrome: [tampermonkey extension](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo?hl=en)
  - firefox: [greasemonkey add-on](https://addons.mozilla.org/en-us/firefox/addon/greasemonkey/) -- not yet tested
  - ie: ?

## installation

 - install the appropriate addon for your browser
 - open the [gmusic-playlist.user.js](gmusic-playlist.user.js?raw=true) script in your browser and click the install button.

## usage

 - navigate to [Google Music](http://music.google.com)
 - click the menu item to access the import / export functionality.

![Screenshot](screenshot.png?raw=true "Screenshot of the UI")

## importing

the script will allow songs to be imported from csv formated files. a single
file will be used for one or more playlists, a column in the csv file will
indicate which playlist a song belongs in. the first row of the csv file will
be reserved for headers indicating what each column in the file is.

see the [example.csv](example.csv) file for a fairly detailed set of playlists
and see the [example_minimal.csv](example_minimal.csv) file for the minimum
required structure needed for importing a list of songs.

when creating a csv file use the unicode utf-8 character set and a comma
as a the seperator character. some spreadsheet apps default to another
character set when saving to csv so be aware.

click the button bellow Import Playlists to select the csv file to import.

after the file is imported, a results csv file will be provided that includes
all the songs that were imported and their associated ids and other info. the
file can be used to see which songs imported correctly and which ones didn't.
for the songs that didn't import correctly the data can be updated and the file
re-imported if needed.

## exporting

the script will export songs to csv formated files. a single file will be
exported for all playlists. each song will have the playlist that it belonged
to exported as a column in the csv file. the first row of the csv file will be
reserved for headers indicating what each column in the file is.

click the Export Playlists link to export the playlists.

in addition to playlists, the entire personal library will also be exported
into a playlist called Library.

## see also

 - [the original python based version](
   https://github.com/soulfx/gmusic-playlist)
