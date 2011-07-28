/** URL of most recent script. Currently the master branch of my GitHub. */
var SCRIPT_URL = "https://raw.github.com/sarenji/poserver/master/scripts.js"

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
var TEMPORARY_BANS           = {};          // keys are ips

/*
TODO:
make bans persistent
Race conditions involving delayedCalls. Need a way to clear them.
make ranking work for other players as well
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
    sys.kick(this.id);
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
  return this.auth > other.auth;
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
commands.commands = function() {
  for (var i = 0; i <= this.auth; i++) {
    for (var j = 0; j < help[i].length; j++) {
      announce(this.id, help[i][j]);
    }
  }
};

commands.auth = function(type, token, newAuth) {
  var list = sys.dbAuths().sort();
  
  if (type === "group") {
    var group = AUTH_VALUES[token.toUpperCase()];
    list      = findGroupAuthLevel(group, list);
    
    for (var i = 0, len = list.length; i < len; i++) {
      announce(this.id, list[i]);
    }
  } else if (type === "user") {
    if (this.authedFor(OWNER) && newAuth) {
      var id = sys.id(token);
      sys.changeAuth(id, newAuth);
      announce(this.id, "You set " + token + "'s authority level to " + newAuth + ".");
    } else {
      var auth = sys.auth(token);
      var id   = sys.id(token);
      announce(this.id, token + "'s authority level is " + auth + ".");
    }
  } else {
    announce(this.id, "Invalid arguments.");
  }
};

commands.ranking = function() {
  var rank = sys.ranking(this.id);
  var tier = sys.tier(this.id);
  if (rank) {
    announce(this.id, "Your rank in " + tier + " is " + rank
      + "/" + sys.totalPlayersByTier(tier) + " ["
      + sys.ladderRating(this.id) + " points / "
      + sys.ratedBattles(this.id) +" battles]!");
  } else {
    announce(this.id, "You are not ranked in " + tier + " yet!");
  }
};

commands.k = commands.kick = function(player_name) {
  var player = getPlayer(player_name);
  if (this.authedFor(MODERATOR) && this.outranks(player)) {
    var player_id = sys.id(player_name);
    sys.kick(player_id);
    announce(this.name + " kicked " + player_name + ".");
  }
};

commands.reload = function() {
  if (this.authedFor(OWNER)) {
    if (arguments.length > 0) {
      var scriptURL = arguments[0];
      for (var i = 1, len = arguments.length; i < len; i++) {
        scriptURL += ":" + arguments[i];
      }
      
      sys.webCall(scriptURL, function(res) {
        try {
          sys.changeScript(res);
          sys.writeToFile("scripts.js", res);
          announce(this.id, "Script reloaded!");
        } catch (err) {
          sys.changeScript(sys.getFileContent("scripts.js"));
          announce(this.id, "Could not reload! ERROR: " + err);
        }
      });
    } else {
      try {
        sys.system("curl -o new_scripts.js " + SCRIPT_URL);
        var new_scripts = sys.getFileContent("new_scripts.js");
        sys.changeScript(new_scripts);
        if (new_scripts) {
          sys.writeToFile("scripts.js", new_scripts);
          announce(this.id, "Script reloaded!");
        } else {
          announce(this.id, "ERROR: The script fetched was a blank file.");
        }
      } catch (err) {
        announce(this.id, "Could not reload! ERROR: " + err);
      }
    }
  }
};

commands.wall = function(args) {
  if (this.authedFor(MODERATOR)) {
    var message = args;
    for (var i = 1, len = arguments.length; i < len; i++) {
      message += " " + arguments[i];
    }
    announce(message);
  }
};

function parseLength(length) {
  var groups = length.match(/\d+[mshdyMw]?/g);
  var time   = 0;
  for (var i = 0, len = groups.length; i < len; i++) {
    var last = groups[len - 1];
    switch (last) {
      case 's':
        time += parseInt(last, 10);
        break;
      case 'm':
        time += parseInt(last, 10) * 60;
        break;
      case 'd':
        time += parseInt(last, 10) * 60 * 60 * 24;
        break;
      case 'w':
        time += parseInt(last, 10) * 60 * 60 * 24 * 7;
        break;
      case 'M':
        time += parseInt(last, 10) * 60 * 60 * 24 * 30;
        break;
      case 'y':
        time += parseInt(last, 10) * 60 * 60 * 24 * 30 * 12;
        break;
      case 'h':
      default:
        time += parseInt(last, 10) * 60 * 60;
        break;
    }
  }
  return time;
}

function pluralize(word, number) {
  return number === 1 ? word : word + "s";
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

/** length is in minutes. */
commands.b = commands.ban = function(player_name, length) {
  var player = getPlayer(player_name);
  if (this.authedFor(MODERATOR) && this.outranks(player)) {
    var player_id = sys.id(player_name);
    sys.ban(player_name);
    sys.kick(player_id);
    
    if (length) {
      length = parseLength(length);
    }
    
    // limit mod bans to 3 hours max
    if (this.auth == MODERATOR) {
      if (length) {
        length = Math.min(length, MODERATOR_MAX_BAN_LENGTH);
      } else {
        length = MODERATOR_MAX_BAN_LENGTH;
      }
    }
    
    if (length) {
      // unban after a set amount of minutes
      // TODO: save bans in case of server crash
      sys.delayedCall(function() {
        sys.unban(player_name);
      }, length);
      var ip = sys.dbIp(player_name);
      TEMPORARY_BANS[ip] = {
        expires : getTime() + length * 1000
      };
      
      announce(player_name + " was banned for " + prettyPrintTime(length) + ".");
    } else {
      announce(player_name + " was banned forever.");
    }
  }
};

commands.unban = function(playerName) {
  var player = getPlayer(playerName);
  if (this.authedFor(MODERATOR) && this.outranks(player)) {
    var ip = sys.dbIp(playerName);
    if (ip === undefined) {
      announce(this.id, "No such user!");
    } else if (ip in TEMPORARY_BANS) {
      sys.unban(player_name);
      delete TEMPORARY_BANS[ip];
      announce(this.name + " unbanned " + playerName + ".");
    } else {
      announce(this.id, "This player is not banned!");
    }
  }
};

commands.ipunban = function(ip) {
  if (this.authedFor(MODERATOR)) {
    sys.unban(ip);
  }
}

commands.mute = function(player_name, length) {
  var player = getPlayer(player_name);
  if (this.authedFor(MODERATOR) && this.outranks(player)) {
    var message = this.name + " muted " + player_name;
    player.muted = true;
    
    if (length) {
      length = parseLength(length);
      sys.delayedCall(function() {
        player.muted = false;
      }, length);
      message += " for " + prettyPrintTime(length) + ".";
    }
    
    announce(message + ".");
  }
};
commands.unmute = function(player_name) {
  var player = getPlayer(player_name);
  if (this.authedFor(MODERATOR) && this.outranks(player)) {
    var player = getPlayer(player_name);
    player.muted = false;
    announce(this.name + " unmuted " + player_name + ".");
  }
};

commands.clearpass = function(player_name) {
  if (player_name === undefined) {
    sys.clearPass(this.name);
    announce(this.id, "Your password was cleared.");
  } else if (this.authedFor(OWNER)) {
    sys.clearPass(player_name);
    announce(this.id, "You cleared " + player_name + "'s password.");
  }
};

function makeKey(player_id) {
  var arr = [ sys.ip(player_id) ];
  for (var i = 1, len = arguments.length; i < len; i++) {
    arr.push(arguments[i]);
  }
  return arr.join(":");
}

function findGroupAuthLevel(auth, list) {
  var arr = [];
  for (var i = 0, len = list.length; i < len; i++) {
    var userName = list[i];
    var status   = sys.id(userName) ? " (Online)" : " (Offline)";
    arr.push(userName + status);
  }
  return arr;
}

function getPlayer(player_name) {
  var player_id = sys.id(player_name);
  return SESSION.users(player_id);
}

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

SESSION.registerUserFactory(User);

({
  serverStartUp : function() {
    
  },
  beforeLogIn : function(player_id) {
    var player_name = sys.name(player_id);
    if (/[^\w-\[\]\. ]/g.test(player_name)) {
      announce(player_id, "Please do not use special characters in your name.");
      sys.stopEvent();
      return;
    }
    
    var ip = sys.ip(player_id);
    if (ip in TEMPORARY_BANS) {
      if (TEMPORARY_BANS[ip].expires <= getTime()) {
        delete TEMPORARY_BANS[ip];
        sys.unban(player_name);
      } else {
        sys.stopEvent();
        return;
      }
    }
  },
  afterLogIn : function(player_id) {
    
  },
  beforeChatMessage: function(player_id, message) {
    var user = SESSION.users(player_id);
    message  = sanitize(message);
    if (message.length === 0) {
      sys.stopEvent();
      return;
    }
    
    if (message[0] === '/' && message.length > 1) {
      sys.stopEvent();
      message     = message.substr(1);
      var pieces  = message.split(/\s+/);
      var command = pieces.shift();
      pieces      = pieces.join(" ").split(":");
      user.run(command, pieces);
      return;
    }
    
    if (user.muted) {
      sys.stopEvent();
      return;
    }
    
    user.log(message);
  }
})
