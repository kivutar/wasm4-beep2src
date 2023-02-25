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
	  { instrument: 0, volume: 100, notes: [] },
	  { instrument: 0, volume: 100, notes: [] },
	  { instrument: 0, volume: 100, notes: [] },
	  { instrument: 0, volume: 100, notes: [] },
  ]
};

/**
 * Instance an description object for one note.
 *
 * @param {Object} note Note object (from BeepBox file).
 *
 * @return {Object}
 */
Music.createNote = function(seqIndex, note) {
  // Description object.
  let noteObject = {
    pitch   : note.pitches[0],
    start   : note.points[0].tick+seqIndex*32,
    end     : note.points[1].tick+seqIndex*32,
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
	const wave = channel.instrument;
	const volume = channel.volume;
    text += `\t\t{\n`;
    text += `\t\t\tinstrument: ${wave},\n`;
    text += `\t\t\tvolume: ${volume},\n`;
    text += `\t\t\ttones: [][3]uint16{\n`;
    for(let i = 0; i < channel.notes.length; i++) {
      let note = channel.notes[i];
      text += `\t\t\t\t{0x${note.start.toString(16).padStart(2,0)}, 0x${note.pitch.toString(16).padStart(2,0)}, 0x${note.sustain.toString(16).padStart(2,0)}},\n`;
    }
    text += `\t\t\t},\n`;
    text += `\t\t},\n`;
  }

  return text;
};

/** Ticks per beat. */
let ticks = data.ticksPerBeat;
let sequences = data.channels[0].sequence.length;

for(let ci in data.channels) {
  if (ci >= Music.channels.length) continue;

  let channel = data.channels[ci];
  let seq = channel.sequence;
  Music.channels[ci].instrument = ci;
  Music.channels[ci].volume = channel.instruments[0].volume;
  
  // Iterate through the track...
  for(let si in seq) {
	let pi = seq[si];
	if (pi == 0) { continue }
    let notes = channel.patterns[pi-1].notes

    for(let ni in notes) {
      let note = notes[ni];
  
      // Description object.
      let noteObject = Music.createNote(si, note);
  
      // Save music...
      if(noteObject)
        Music.channels[ci].notes.push(noteObject);
    }
  }
}

// Print track...
result += `package main

// Soundtrack: ${Music.name}
var ${Music.name} = Track{
\tticks: ${ticks},
\tsequences: ${sequences},
\tchannels: []*Channel{
${Music.print()}
\t},
}`;

// Result.
console.log(result);
