/** URL of most recent script. Currently the master branch of my GitHub. */
var SCRIPT_URL = "https://raw.github.com/sarenji/poserver/master/scripts.js"
/** URL of most recent tiers.xml. Currently the master branch of my GitHub. */
var TIERS_URL  = "https://raw.github.com/sarenji/poserver/master/tiers.xml"

/** User authentication constants */
var USER          = 0;
var MODERATOR     = 1;
var ADMINISTRATOR = 2;
var OWNER         = 3;

var AUTH_VALUES = {
  OWNER         : OWNER,
  ADMIN         : ADMINISTRATOR,
  ADMINISTRATOR : ADMINISTRATOR,
  MOD           : MODERATOR,
  MODERATOR     : MODERATOR,
  USER          : USER
};

/** Other constants */
var MODERATOR_MAX_BAN_LENGTH = 3 * 60 * 60; // in seconds

/*
TODO:
tournaments (w/ channel too)
wall should hit all channels
*/

function User(id) {
  this.id = id;
  this.ip = sys.ip(id);
  this.name = sys.name(id);
  this.auth = sys.auth(id);
  this.muted = false;
  this.lastMessage = null;
  this.lastMessageTime = 0;
  this.idle = sys.away(id);
}

User.prototype.authedFor = function(auth) {
  return this.auth >= auth;
}

User.prototype.run = function(command, args) {
  if (command in commands) {
    commands[command].apply(this, args);
  }
}

User.prototype.log = function(message) {
  if (this.isSpamming(message)) {
    sys.stopEvent();
    kick(this.name);
  }
  this.lastMessage = message;
  this.lastMessageTime = getTime();
}

User.prototype.isSpamming = function(message) {
  if (this.authedFor(MODERATOR)) {
    return false;
  }
  
  if (this.lastMessage === message) {
    return true;
  }
  
  if (timeDelta(this.lastMessageTime) < 50) {
    return true;
  }
  return false;
}

User.prototype.outranks = function(other) {
  if (typeof other === "number") {
    return this.auth > other;
  } else {
    return this.auth > other.auth;
  }
}

function getPlayer(player_name) {
  var player_id = sys.id(player_name);
  return SESSION.users(player_id);
}

// temporary until i figure out a nicer way of doing this.
var help = [
  [
    "** BASIC USER COMMANDS",
    "/ranking -- See your own ranking.",
    "/clearpass -- Clear your own password",
    "/auth group:name"
  ], [
    "** MODERATOR COMMANDS",
    "/kick user",
    "/k is aliased to /kick.",
    "/ban user -- bans user for " + MODERATOR_MAX_BAN_LENGTH / 60 / 60 + " hours.",
    "/ban user:duration -- duration is in hours. Maximum of " + MODERATOR_MAX_BAN_LENGTH / 60 / 60 + " hours.",
    "/b is aliased to /ban.",
    "/unban user",
    "/mute -- mutes whole server",
    "/mute user",
    "/mute user:duration",
    "/unmute user",
    "/wall message"
  ], [
    "** ADMINISTRATOR COMMANDS",
    "/ban user -- bans user permanently.",
    "/b is aliased to /ban."
  ], [
    "** OWNER COMMANDS",
    "/clearpass user -- Clear user's password."
  ]
];

/** All of these commands are run in the context of a User object. */
var commands = {};
function addCommand(commandName, func) {
  if (typeof commandName == "string") {
    commands[commandName] = func;
  } else {
    for (var i = 0; i < commandName.length; i++) {
      commands[commandName[i]] = func;
    }
  }
}

function addAuthCommand(auth, commandName, func) {
  addCommand(commandName, function() {
    if (this.authedFor(auth)) {
      func.apply(this, arguments);
    }
  });
}

function addModCommand(commandName, func) {
  addAuthCommand(MODERATOR, commandName, func);
}

function addAdminCommand(commandName, func) {
  addAuthCommand(ADMINISTRATOR, commandName, func);
}

function addOwnerCommand(commandName, func) {
  addAuthCommand(ADMINISTRATOR, commandName, func);
}

addCommand([ "help", "commands" ], function() {
  for (var i = 0; i <= this.auth; i++) {
    for (var j = 0; j < help[i].length; j++) {
      announce(this.id, help[i][j]);
    }
  }
});

addCommand("auth", function(type, token, newAuth) {
  var list = sys.dbAuths();
  
  if (type === "group") {
    var group = AUTH_VALUES[token.toUpperCase()];
    list      = findGroupAuthLevel(group, list).sort();
    
    for (var i = 0, len = list.length; i < len; i++) {
      announce(this.id, list[i]);
    }
  } else if (type === "user") {
    if (newAuth) {
      if (this.authedFor(OWNER)) {
        var id = sys.id(token);
        sys.changeAuth(id, newAuth);
        announce(this.id, "You set " + token + "'s authority level to " + newAuth + ".");
      }
    } else {
      var id   = sys.id(token);
      var auth = sys.auth(id);
      announce(this.id, token + "'s authority level is " + auth + ".");
    }
  } else {
    announce(this.id, "Invalid arguments.");
  }
});

addOwnerCommand("eval", function() {
  var stuff = toArray(arguments);
  sys.eval(stuff);
});

addCommand([ "idle", "away"], function() {
  this.idle = !this.idle;
  sys.changeAway(this.id, this.idle);
});

addCommand("ranking", function(player_name) {
  var player  = this;
  if (player_name) {
    player = getPlayer(player_name);
  }
  var rank   = sys.ranking(player.id);
  var tier   = sys.tier(player.id);
  if (rank) {
    var possessive = player_name ? player_name + "'s" : "Your";
    announce(this.id, possessive + " rank in " + tier + " is " + rank
      + "/" + sys.totalPlayersByTier(tier) + " ["
      + sys.ladderRating(player.id) + " points / "
      + sys.ratedBattles(player.id) +" battles]!");
  } else {
    var noun = player_name ? player_name + " is" : "You are";
    announce(this.id, noun + " not ranked in " + tier + " yet!");
  }
});

addModCommand([ "kick", "k" ], function(player_name, reason) {
  var player = getPlayer(player_name);
  if (this.outranks(player)) {
    var message = this.name + " kicked " + player_name + ".";
    if (reason) {
      message += " (" + reason + ")";
    }
    announce(message);
    kick(player_name);
  }
});

addOwnerCommand("reload", function() {
  var id = this.id;
  if (arguments.length > 0) {
    var scriptURL = toArray(arguments);
    
    sys.webCall(scriptURL, function(res) {
      sys.changeScript(res);
      sys.writeToFile("scripts.js", res);
      announce(id, "Script reloaded!");
    });
  } else {
    sys.system("curl -k -o new_scripts.js " + SCRIPT_URL);
    var new_scripts = sys.getFileContent("new_scripts.js");
    sys.changeScript(new_scripts, true);
    sys.writeToFile("scripts.js", new_scripts);
    announce(id, "Script reloaded!");
  }
});

addOwnerCommand("reloadtiers", function() {
  var id = this.id;
  sys.system("curl -k -o tiers.xml " + TIERS_URL);
  sys.reloadTiers();
  announce(id, "Tiers reloaded!");
});

addModCommand("wall", function() {
  var message = toArray(arguments).join(":");
  announce(message);
});

addModCommand([ "ban", "b" ], function(player_name, length, reason) {
  var auth = parseInt(sys.dbAuth(player_name), 10);
  var message;
  if (this.outranks(auth)) {
    if (length && /^(\d+[mshdyMw]?)+$/.test(length)) {
      length = parseLength(length);
    } else {
      reason = length;
      length = MODERATOR_MAX_BAN_LENGTH;
    }
    
    // limit mod bans
    if (this.auth === MODERATOR) {
      length = Math.min(length, MODERATOR_MAX_BAN_LENGTH);
    }
    
    message = player_name + " was banned for " + prettyPrintTime(length) + ".";
    if (reason) {
      message += " (" + reason + ")";
    }
    announce(message);
    ban(player_name, getTime() + length * 1000);
  }
});

addAdminCommand(["permban", "permaban", "pb"], function(playerName, reason) {
  var auth = parseInt(sys.dbAuth(playerName), 10);
  if (this.outranks(auth)) {
    var message = playerName + " was banned for eternity.";
    if (reason) {
      message += " (" + reason + ")";
    }
    ban(playerName);
    announce(message);
  }
});

addModCommand("unban", function(playerName) {
  var auth       = parseInt(sys.dbAuth(playerName), 10);
  var expiresKey = makeKey(playerName, "ban:expires");
  if (this.outranks(auth)) {
    var ip = sys.dbIp(playerName);
    if (ip === undefined) {
      announce(this.id, "No such user!");
    } else if (getValue(expiresKey)) {
      sys.unban(playerName);
      deleteValue(expiresKey);
      announce(this.name + " unbanned " + playerName + ".");
    } else {
      announce(this.id, "This player is not banned!");
    }
  }
});

addModCommand("ipunban", function(ip) {
  sys.unban(ip);
});

addModCommand("mute", function(player_name, length) {
  var player = getPlayer(player_name);
  if (this.outranks(player)) {
    if (player.muted) {
      announce(this.id, player_name + " is already muted!");
      return;
    }
    
    var message = this.name + " muted " + player_name;
    player.muted = true;
    
    if (length) {
      var key = makeKey(player.name, "muted");
      length = parseLength(length);
      setValue(key, getTime() + length);
      sys.delayedCall(function() {
        var expired = getValue(makeKey(player.name, "muted"), 0);
        if (parseInt(expired, 10) < getTime()) {
          player.muted = false;
          deleteValue(key);
        }
      }, length);
      message += " for " + prettyPrintTime(length);
    }
    
    announce(message + ".");
  }
});

addModCommand("unmute", function(playerName) {
  var player = getPlayer(playerName);
  if (this.outranks(player)) {
    if (player.muted) {
      var key = makeKey(player.name, "muted");
      player.muted = false;
      deleteValue(key);
      announce(this.name + " unmuted " + playerName + ".");
    } else {
      announce(this.id, playerName + " is not muted!");
    }
  }
});

addCommand("clearpass", function(player_name) {
  if (player_name === undefined) {
    sys.clearPass(this.name);
    announce(this.id, "Your password was cleared.");
  } else if (this.authedFor(OWNER)) {
    sys.clearPass(player_name);
    announce(this.id, "You cleared " + player_name + "'s password.");
  }
});

/*******************\
* Script wrappers   *
\*******************/
function kick(playerName) {
  var id = sys.id(playerName);
  if (id) {
    sys.kick(id);
  }
}

function ban(playerName, expires) {
  var banKey = makeKey(playerName, "ban");
  setValue(banKey + ":expires", expires || 0);
  kick(playerName);
  if (!expires) {
    sys.ban(playerName);
  }
}

/*******************\
* Registry helpers  *
\*******************/
function makeKey(playerName) {
  var arr = toArray(arguments, 1);
  arr.unshift(sys.dbIp(playerName));
  return arr.join(":");
}

function getValue(key, defaultValue) {
  return sys.getVal(key) || defaultValue;
}

function setValue(key, value) {
  sys.saveVal(key, value);
}

function deleteValue(key) {
  sys.removeVal(key);
}

/*******************\
* Time helpers      *
\*******************/
function parseLength(length) {
  var groups = length.match(/\d+[mshdyMw]?/g);
  var time   = 0;
  for (var i = 0, len = groups.length; i < len; i++) {
    var first = groups[i].substring(0, groups[i].length - 1);
    var last  = groups[i].substr(-1);
    switch (last) {
      case 's':
        time += parseInt(first, 10);
        break;
      case 'm':
        time += parseInt(first, 10) * 60;
        break;
      case 'd':
        time += parseInt(first, 10) * 60 * 60 * 24;
        break;
      case 'w':
        time += parseInt(first, 10) * 60 * 60 * 24 * 7;
        break;
      case 'M':
        time += parseInt(first, 10) * 60 * 60 * 24 * 30;
        break;
      case 'y':
        time += parseInt(first, 10) * 60 * 60 * 24 * 30 * 12;
        break;
      case 'h':
      default:
        time += parseInt(first, 10) * 60 * 60;
        break;
    }
  }
  return time;
}

function prettyPrintTime(seconds) {
  function _(by, next, text) {
    seconds = Math.floor(seconds / by);
    var mod = seconds % next;
    if (mod !== 0) {
      time.unshift(mod + " " + pluralize(text, mod));
    }
  }
  var time = [];
  _(1,  60, "second");
  _(60, 60, "minute");
  _(60, 24, "hour");
  _(24, 7,  "day");
  _(7,  4,  "week");
  _(4,  12, "month");
  _(12, seconds + 1, "year");
  return time.join(", ");
}

function getTime() {
  return +new Date;
}

function timeDelta(milliseconds) {
  return getTime() - milliseconds;
}

/*******************\
* Auth helpers      *
\*******************/
function findGroupAuthLevel(auth, list) {
  var arr = [];
  for (var i = 0, len = list.length; i < len; i++) {
    var userName = list[i];
    var userId   = sys.id(userName);
    var userAuth = sys.auth(userId);
    if (userAuth == auth) {
      var status = userId ? " (Online)" : " (Offline)";
      arr.push(userName + status);
    }
  }
  return arr;
}

/*******************\
* Chat helpers      *
\*******************/
function announce(player_id, message) {
  if (message === undefined) {
    message = player_id;
    sys.sendAll("*** " + message);
  } else {
    sys.sendMessage(player_id, "*** " + message);
  }
}

function sanitize(message) {
  // whitelist includes: a-zA-Z0-9_, -, space, {}[]/\()[]!@#$%^&*"'?<>+=`~|.,:;
  message = message.replace(/[^\w\-\[\]\/\\\(\)\<\>\!\@\#\$\%\^\&\*\~\`\=\+\"\'\,\.\?\{\}\;\:\| ]/g, "");
  message = message.replace(/^\s+/, "");
  message = message.replace(/\s+$/, "");
  return message;
}

function pluralize(word, number) {
  return number !== 1 ? word + "s" : word;
}

/*******************\
* Generic helpers   *
\*******************/
function compact(array) {
  new_array = [];
  for (var i = 0; i < array.length; i++) {
    if (array[i]) {
      new_array.push(array[i]);
    }
  }
  return new_array;
}

function toArray(args, startIndex) {
  startIndex = startIndex || 0;
  var array  = [];
  for (var i = startIndex, len = args.length; i < len; i++) {
    array.push(args[i]);
  }
  return array;
}

/*******************\
* PO Factories      *
\*******************/
SESSION.registerUserFactory(User);

/*******************\
* Starter scripts   *
\*******************/
function serverStartUp() {
  // update existing User prototypes
  sys.playerIds().forEach(function(id) {
    var user = SESSION.users(id);
    if (user) {
      user.__proto__ = User.prototype;
    }
  });
}

function beforeLogIn(player_id) {
  var player_name = sys.name(player_id);
  if (/[^\w-\[\]\. ]/g.test(player_name)) {
    announce(player_id, "Please do not use special characters in your name.");
    sys.stopEvent();
    return;
  }
  
  // unban users
  var expireKey = makeKey(player_name, "ban:expires");
  var expires   = parseInt(getValue(expireKey), 10);
  if (expires > 0) {
    if (expires > getTime()) {
      sys.stopEvent();
      return;
    } else {
      deleteValue(expireKey);
    }
  }
}

function afterLogIn(player_id) {
  var user    = SESSION.users(player_id);
  var key     = makeKey(user.name, "muted");
  var expired = parseInt(getValue(key, 0), 10);
  if (expired > getTime()) {
    user.muted = true;
  } else {
    deleteValue(key);
  }
}

function beforeChatMessage(player_id, message, channelId) {
  var user = SESSION.users(player_id);
  message  = sanitize(message);
  sys.stopEvent();
  if (message.length === 0) {
    return;
  }
  
  if (message[0] === '/' && message.length > 1) {
    message     = message.substr(1);
    var pieces  = message.split(/\s+/);
    var command = pieces.shift();
    pieces      = compact(pieces.join(" ").split(":"));
    user.run(command, pieces);
    return;
  }
  
  if (user.muted) {
    return;
  }
  
  user.log(message);
  sys.sendAll(user.name + ": " + message, channelId);
}

({
  serverStartUp     : serverStartUp,
  beforeLogIn       : beforeLogIn,
  afterLogIn        : afterLogIn,
  beforeChatMessage : beforeChatMessage
})
