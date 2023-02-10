/** Filesystem library. */
let fs = require("fs");

/** Command line arguments. */
var arguments = process.argv.slice(2);

/** Expected arguments to be received. */
var expectedArguments = 3;

// Display usage when not enough arguments are passed...
if(arguments.length < expectedArguments) {
  console.log(`
===========================================================
BeatBox to WASM-4 Importer
Version 0.0.0.1
===========================================================
Usage:
  * node beep2src {@path} {@resname} {@incdriver}

@path: path to BeepBox's JSON file.
@resname: Resource name (that is, the variable).
@incdriver: use "true" to include the driver.
===========================================================
Notes:
  * Scale must be "expert", key must be "C".
  * Only the very first instrument will be converted.
  * It only works with one track.
  * Each track has support for 32 notes.
  * This may or may not be updated (it's just a PoC).
  * Only Rust is supported.
===========================================================
BeepBox:
  * Official website: https://www.beepbox.co/2_3/
  * Only version 2.3 is supported.
===========================================================
`);
  return;
}

/** BeepBox music file. */
let file = fs.readFileSync(arguments[0].toString(), "utf8");

/** BeepBox data object parsed from JSON. */
let data = JSON.parse(file);

/** Templates in use. */
let templates = {
  driver: fs.readFileSync("./templates/driver.rs", "utf8")
};

// Final result.
let result = "";

// Include driver (optional)...
if(arguments[2].toString().trim().toLowerCase() === "true") {
  result += templates.driver;
}

/**
 * BeepBox settings.
 * Some important notes:
 *
 * ~ Tones SHOULD be in scale "expert" and key "C".
 * ~ The "introBars" and "loopBars" determine music duration. In the context
 *   of the original file, they represent offsets from the beginning and the
 *   end of the music.
 */
let BeepBox = {
  /** Musical note indexes, sorted by pitch. */
  notes: [
    36, 37, 38, 39, 40, 41, 42, 43, 44,
    45, 46, 47, 48, 49, 50, 51, 52, 53,
    54, 55, 56, 57, 58, 59, 60, 61, 62,
    63, 64, 65, 66, 67, 68, 69, 70, 71,
    72
  ],
  /** Musical note names. */
  names: [
     "C0", "D+0",  "D0", "E+0",  "E0",  "F0", "F#0",  "G0", "A+0",
     "A0", "B+0",  "B0",  "C1", "D+1",  "D1", "E+1",  "E1",  "F1",
    "F#1",  "G1", "A+1",  "A1", "B+1",  "B1",  "C2", "D+2",  "D2",
    "E+2",  "E2",  "F2", "F#2",  "G2", "A+2",  "A2", "B+2",  "B2",
     "C3"
  ],
  /** WASM-4 equivalent of musical tones, using the same musical notes. */
  tones: [
     130,  140,  150,  160,  170,  180,  190,  200,  210,
     220,  230,  250,  260,  280,  290,  310,  330,  350,
     370,  390,  410,  440,  460,  490,  520,  550,  600,
     620,  660,  700,  750,  780,  840,  880,  940,  980,
    1000
  ],
  /** Waves (instruments) available for use. */
  waves: [
    "triangle",
    "square",
    "pulse wide",
    "pulse narrow",
    "sawtooth"
  ]
};

/**
 * Music data mounted via conversion.
 */
let Music = {
  /** Variable name. */
  name : arguments[1].toString().trim(),
  channels: [
	  { instrument: 0, notes: [] },
	  { instrument: 0, notes: [] },
	  { instrument: 0, notes: [] },
	  { instrument: 0, notes: [] },
  ]
};

/**
 * Instance an description object for one note.
 *
 * @param {Object} note Note object (from BeepBox file).
 *
 * @return {Object}
 */
Music.createNote = function(patIndex, note) {
  // Get note index...
  let noteIndex = BeepBox.notes.indexOf(note.pitches[0]);

  // Check if note index is valid...
  if(noteIndex <= 0 || isNaN(noteIndex)) {
    noteIndex = 0xFF;
  }

  // Description object.
  let noteObject = {
    pitch   : note.pitches[0],
    start   : note.points[0].tick+patIndex*32,
    end     : note.points[1].tick+patIndex*32,
    tone    : noteIndex,
    sustain : 5,
    duration: (note.points[1].tick - note.points[0].tick)
  };

  // Calculate music sustain.
  if(noteObject.duration > 2) {
    noteObject.sustain = (noteObject.duration * 5) - 5;
  }

  return noteObject;
};

/**
 * Create an empty description note.
 *
 * @return {Object}
 */
Music.createNoteEmpty = function() {
  return {
    pitch   : null,
    start   : null,
    end     : null,
    tone    : 0xFF,
    sustain : 5,
    duration: null
  };
};

/**
 * Print every saved note in array format (text).
 *
 * @return {string}
 */
Music.print = function() {
  // Text to return.
  let text = "";

  // Iterate through each note and concatenate text...
  for(let j = 0; j < Music.channels.length; j ++) {
    const channel = Music.channels[j];
	const wave = BeepBox.waves.indexOf(channel.instrument.wave);
    text += `\t\t{\n`;
    text += `\t\t\tinstrument: ${wave >= 0 ? wave : 0},\n`;
    text += `\t\t\ttones: [][3]byte{\n`;
    for(let i = 0; i < channel.notes.length; i++) {
      let note = channel.notes[i] || Music.createNoteEmpty();
		if(channel.notes[i])
      text += `\t\t\t\t{0x${note.tone.toString(16).padStart(2,0)}, 0x${note.sustain.toString(16).padStart(2,0)}, 0x00},\n`;
    }
    text += `\t\t\t},\n`;
    text += `\t\t},\n`;
  }

  return text;
};

// Fill soundtrack with empty notes. They will be replaced by actual notes
// when the data file is processed...
for(let j = 0; j < Music.channels.length; j++) {
  for(let i = 0; i < 32; i++) {
    Music.channels[j].notes[i] = Music.createNoteEmpty();
  }
}

/** Ticks per beat. */
let ticks = data.ticksPerBeat;

for(let ci in data.channels) {
  let channel = data.channels[ci];
  
  /** Wave name in use. */
  Music.channels[ci].instrument = channel.instruments[0];
  
  // Iterate through the track...
  for(let pi in channel.patterns) {
    let notes = channel.patterns[pi].notes
    for(let ni in notes) {
      let note = notes[ni];
  
      // Description object.
      let noteObject = Music.createNote(pi, note);
  
      // Save music...
      Music.channels[ci].notes[noteObject.start] = noteObject;
    }
  }
}

// Print track...
result += `package main

// Soundtrack: ${Music.name}
var ${Music.name} = Track{
\tticks: ${ticks},
\tchannels: []*Channel{
${Music.print()}
\t},
}`;

// Result.
console.log(result);
