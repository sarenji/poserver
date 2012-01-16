/** URL of most recent script. Currently the master branch of my GitHub. */
var REMOTE_SCRIPT_URL = "https://raw.github.com/sarenji/poserver/master/scripts.js"
/** URL of most recent tiers.yml. Currently the master branch of my GitHub. */
var REMOTE_TIERS_URL  = "https://raw.github.com/sarenji/poserver/master/tiers.yml"

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

var SAY_LEVEL = OWNER;

/** Other constants */
var SCRIPTS_URL = "scripts.js";
var SCRIPTS_BACKUP_URL = "new_" + SCRIPTS_URL;
var MODERATOR_MAX_BAN_LENGTH = 24 * 60 * 60; // in seconds
var MAIN_CHANNEL = "Dragonspiral Tower";
var dreamWorldPokemon = {};
var silence = false;
var battlesStopped = false;

var pokemonHash = {};
var counter = 1, pokemonName;
while ((pokemonName = sys.pokemon(counter)) !== "Missingno") {
  pokemonHash[pokemonName] = counter;
  counter++;
}

var Tournament = (function() {

var TOURNAMENT_INACTIVE = 0;
var TOURNAMENT_SIGNUPS  = 1;
var TOURNAMENT_ACTIVE   = 2;

function Tournament() {
  this.initialize();
}

Tournament.prototype.initialize = function() {
  this.tier       = "StreetPKMN";
  this.state      = TOURNAMENT_INACTIVE;
  this.round      = 0;
  this.numSpots   = 0;
  this.players    = [];
  this.pairings   = [];
  this.matches    = [];
  this.numPlayers = 0;
  this.losers     = {};
  this.channelId  = sys.channelId("Tournaments");
};

Tournament.prototype.announce = function() {
  var args = toArray(arguments);
  args.push(this.channelId);
  announce.apply(null, args);
};

Tournament.prototype.announceHTML = function() {
  var args = toArray(arguments);
  args.push(this.channelId);
  announceHTML.apply(null, args);
};

Tournament.prototype.create = function(user, tier, spots) {
  // validate tier
  var tierList = sys.getTierList();
  if (tierList.indexOf(tier) === -1) {
    this.announce(user.id, tier + " is not a valid tier!");
    this.announce(user.id, "Valid tiers are: " + tierList.join(", "));
    return false;
  }

  // only create new tournament if one is not already made.
  if (this.state != TOURNAMENT_INACTIVE) {
    this.announce(user.id, "A tournament is already underway!");
    return false;
  }
  
  // initialization
  this.initialize();
  this.state    = TOURNAMENT_SIGNUPS;
  this.tier     = tier;
  this.numSpots = parseInt(spots, 10);
  
  // print out tournament data for users.
  var table = "<center><table cellpadding='5' border='1' style='background-color: #BFEFFF;'>";
  table += "<tr><td colspan='2'><b>" + user.name + " started a new tournament in #Tournaments!</b></td></tr>";
  table += "<tr><td><b>Tier:</b> " + this.tier + "</td>";
  table += "<td><b>Players:</b> " + this.numSpots + "</td></tr>";
  table += "</table></center>";
  announceHTML(table);
  return true;
};

Tournament.prototype.join = function(user) {
  // check if there's a tournament running first.
  if (this.state === TOURNAMENT_INACTIVE) {
    this.announce(user.id, "There is no tournament running!");
    return;
  } else if (this.round > 1) {
    this.announce(user.id, "You cannot join this tournament now!");
    return;
  }
  
  // check if player is/was already in tournament.
  if (this.players.indexOf(user.name) !== -1) {
    this.announce(user.id, "You are already in the tournament!");
    return;
  } else if (this.losers[user.name]) {
    this.announce(user.id, "You already lost in this tournament!");
    return;
  }
  
  // add player to tournament
  this.players.push(user.name);
  if (this.isActive() && this.findUnpairedMatches().length > 0) {
    // replace a bye
    this.announce(user.name + " joined the tournament!");
    var substitute = user.name;
    var opponent   = this.substituteIn(substitute);
    this.numPlayers++;
    this.announce(substitute + " is now vs. " + opponent + "!");
  } else if (this.players.length > this.numSpots || (this.isActive() && this.players.length > this.numPlayers)) {
    // add a sub
    this.announce(user.name + " joined the tournament as substitute #" + (this.players.length - this.numPlayers) + "!");
  } else {
    this.numPlayers++;
    this.announce(user.name + " joined the tournament! Now " + this.players.length + "/" + this.numSpots + " filled.");
  }
  
  // start tour when applicable
  if (this.players.length === this.numSpots && !this.isActive()) {
    this.state = TOURNAMENT_ACTIVE;
    this.advanceRound();
  }
};

Tournament.prototype.changecount = function(user, newNum) {
  if (this.state !== TOURNAMENT_SIGNUPS) {
    this.announce(user.id, "The tournament is not in the signup stage!");
    return;
  }
  this.numSpots = parseInt(newNum, 10);
  this.announce("The tournament is now " + newNum + "-man.");

  // start tour when applicable
  if (this.players.length >= this.numSpots) {
    this.state = TOURNAMENT_ACTIVE;
    this.advanceRound();
  }
};

Tournament.prototype.tick = function(winner, loser) {
  if (this.isTourBattle(winner, loser)) {
    this.advanceWinner(winner, loser);
    if (this.matchesLeft() === 0) {
      this.advanceRound();
    } else {
      this.announce(winner + " won a tournament battle! " + this.matchesLeft() + " matches remain.");
    }
  }
};

Tournament.prototype.forceWin = function(user, forcedWinner) {
  var index = this.findMatch(forcedWinner);
  if (index !== -1) {
    var match = this.matches[index];
    var loser = match[0] === forcedWinner ? match[1] : match[0];
    this.announce(user.name + " forced " + forcedWinner + " to take the win!");
    this.advanceWinner(forcedWinner, loser);
    if (this.matchesLeft() === 0) {
      this.advanceRound();
    }
  } else {
    this.announce(user.id, forcedWinner + " does not have a match!");
  }
};

Tournament.prototype.advanceWinner = function(winner, loser) {
  this.removeMatch(winner, loser);
  this.removePlayer(loser);
  this.losers[loser] = true;
};

Tournament.prototype.advanceRound = function() {
  this.round++;
  if (this.round > 1) {
    this.numSpots = Math.floor(this.numSpots / 2);
  }
  if (this.numSpots === 0) {
    this.announce("No one wins the tournament! Wait, how did this even happen?");
  } else if (this.numSpots === 1) {
    var userName = this.players.shift();
    this.state = TOURNAMENT_INACTIVE;
    announce(userName + " wins the tournament! Congratulations!");
  } else {
    this.makeMatchups();
    this.viewRound();
  }
};

Tournament.prototype.viewRound = function(user) {
  if (this.state === TOURNAMENT_INACTIVE) {
    announce(user.id, "There is no active tournament!");
    return;
  } else if (this.state === TOURNAMENT_SIGNUPS) {
    announce(user.id, "The " + this.numSpots + "-man " + this.tier + " tournament is still accepting signups!");
    announce(user.id, "");
    for (var i = 0; i < this.players.length; i++) {
      if (i < this.numSpots) {
        announce(user.id, "Player: " + this.players[i]);
      } else {
        announce(user.id, "Sub: " + this.players[i]);
      }
    }
    return;
  }
  var table = "<center><table border='1' cellpadding='5'>";
  table += "<thead><tr><th colspan='2'>Round " + this.round + " &mdash; " + this.tier + "</th></tr></thead><tbody>";
  for (var i = 0; i < this.pairings.length; i++) {
    var match = this.pairings[i];
    table += this.prettyStringMatch(match);
  }
  table += "</tbody></table></center>";
  if (user) {
    this.announceHTML(user.id, table);
    if (this.players.length > this.numPlayers) {
      this.announce(user.id, "Subs: " + this.players.slice(this.numPlayers).join(", "));
    }
  } else {
    this.announceHTML(table);
    if (this.players.length > this.numPlayers) {
      this.announce("Subs: " + this.players.slice(this.numPlayers).join(", "));
    }
  }
};

Tournament.prototype.prettyStringMatch = function(match) {
  var left  = match[0];
  var right = match[1];
  var leftStyle  = "";
  var rightStyle = "";
  var offline    = "background: #bbb";
  if (left === undefined) {
    left  = "<s>bye!</s>";
    right = "<b>" + right +"</b>";
    leftStyle = rightStyle = offline;
  } else if (right === undefined) {
    left  = "<b>" + left +"</b>";
    right = "<s>bye!</s>";
    leftStyle = rightStyle = offline;
  } else if (this.losers[left]) {
    left  = "<s>" + left + "</s>";
    right = "<b>" + right +"</b>";
    leftStyle = rightStyle = offline;
  } else if (this.losers[right]) {
    left  = "<b>" + left +"</b>";
    right = "<s>" + right + "</s>";
    leftStyle = rightStyle = offline;
  } else {
    leftStyle  = this.getBackgroundStyle(left);
    rightStyle = this.getBackgroundStyle(right);
  }
  return "<tr><td style='" + leftStyle +"'>" + left + "</td><td style='" + rightStyle + "'>" + right + "</td></tr>";
};

Tournament.prototype.getBackgroundStyle = function(playerName) {
  if (!sys.id(playerName)) {
    return "background: #f33";
  } else if (sys.battling(sys.id(playerName))) {
    return "background: #9AEDC6";
  } else if (sys.tier(sys.id(playerName)) != this.tier) {
    return "background: #fcc";
  }
  return "";
};

Tournament.prototype.makeMatchups = function() {
  var len  = Math.min(this.players.length, this.numSpots);
  var seen = {};
  var players = [];
  for (var i = 0; i < this.players.length; i++) {
    var player = this.players[i];
    if (!seen[player]) {
      seen[player] = true;
      players.push(player);
    }
  }
  this.players = players;
  
  // randomize
  while (--len > 0) {
      var rand = Math.floor(Math.random() * (len + 1));
      var tmp  = this.players[len];
      this.players[len]  = this.players[rand];
      this.players[rand] = tmp;
  }
  
  len = Math.min(this.numSpots, this.players.length);
  this.matches  = [];
  this.pairings = [];
  if (len === 3) {
    this.matches.push([this.players[0], this.players[1]]);
    this.matches.push([this.players[1], this.players[2]]);
    this.matches.push([this.players[0], this.players[2]]);
    this.pairings.push([this.players[0], this.players[1]]);
    this.pairings.push([this.players[1], this.players[2]]);
    this.pairings.push([this.players[0], this.players[2]]);
  } else {
    for (var i = 0; i < len; i += 2) {
      this.matches.push([this.players[i], this.players[i + 1]]);
      this.pairings.push([this.players[i], this.players[i + 1]]);
    }
    if (len % 2 === 1) {
      this.matches.push([this.players[len - 1], undefined]);
      this.pairings.push([this.players[len - 1], undefined]);
    }
  }
};

Tournament.prototype.isTourBattle = function(userName1, userName2) {
  return this.findMatch(userName1, userName2) !== -1;
};

Tournament.prototype.findMatch = function(userName1, userName2) {
  for (var i = 0; i < this.matches.length; i++) {
    var match = this.matches[i];
    if (!userName2) {
      if (match[0] === userName1 || match[1] === userName1) {
        return i;
      }
    } else if ((match[0] === userName1 && match[1] === userName2)
        || (match[0] === userName2 && match[1] === userName1)) {
      return i;
    }
  }
  return -1;
};

Tournament.prototype.findMatches = function(userName1, userName2) {
  var matches = [];
  for (var i = 0; i < this.matches.length; i++) {
    var match = this.matches[i];
    if (!userName2) {
      if (match[0] === userName1 || match[1] === userName1) {
        matches.push(match);
      }
    } else if ((match[0] === userName1 && match[1] === userName2)
        || (match[0] === userName2 && match[1] === userName1)) {
      matches.push(match);
    }
  }
  return matches;
};

Tournament.prototype.findUnpairedMatches = function() {
  var matches = [];
  for (var i = 0; i < this.matches.length; i++) {
    var match = this.matches[i];
    if (match[0] === undefined || match[1] === undefined) {
      matches.push(match);
    }
  }
  return matches;
};

Tournament.prototype.removeMatch = function(userName1, userName2) {
  var index = this.findMatch(userName1, userName2);
  if (index !== -1) {
    this.matches.splice(index, 1);
  }
};

Tournament.prototype.matchesLeft = function() {
  var numUnpaired = this.findUnpairedMatches().length;
  return this.matches.length - numUnpaired;
};

Tournament.prototype.drop = function(user, playerName) {
  var index = this.players.indexOf(playerName);
  if (index !== -1) {
    this.announce(user.name + " dropped " + playerName + " from the tournament!");
    this.removePlayer(playerName);
    if (this.isActive() && this.matchesLeft() === 0) {
      this.advanceRound();
    }
  } else {
    this.announce(user.id, playerName + " is not in the tournament!");
  }
}

Tournament.prototype.dropout = function(user) {
  var index = this.players.indexOf(user.name);
  if (index !== -1) {
    this.announce(user.name + " dropped out of the tournament!");
    this.removePlayer(user.name);
    if (this.isActive() && this.matchesLeft() === 0) {
      this.advanceRound();
    }
  } else {
    this.announce(user.id, "You are not in the tournament!");
  }
};

Tournament.prototype.removePlayer = function(userName) {
  var index = this.players.indexOf(userName);
  this.players.splice(index, 1);
  if (index < this.numPlayers) {
    this.numPlayers--;
  }
  
  // find the player's matches.
  var matches = this.findMatches(userName);
  if (matches.length === 0) {
    return;
  }
  
  // remove player from matches
  this.replaceWith(matches, userName, undefined);
  this.replaceWith(this.pairings, userName, undefined);
  
  // either sub or give a bye.
  if (this.players.length > this.numPlayers) {
    var substitute = this.players[this.numPlayers];
    var opponent   = this.substituteIn(substitute);
    this.numPlayers++;
    this.announce(substitute + " will be subbing in for " + userName + "!");
    this.announce("New match: " + substitute + " vs. " + opponent + "!");
  } else {
    var match    = matches[0];
    var opponent = match[0] === undefined ? match[1] : match[0];
    this.announce(opponent + " gets a bye!");
  }
};

// returns opponent
Tournament.prototype.substituteIn = function(userName) {
  this.replaceWith(this.pairings, undefined, userName, true);
  return this.replaceWith(this.matches, undefined, userName, true);
};

Tournament.prototype.substitute = function(userName, substitute) {
  // remove substitute from list of players if applicable.
  var index = this.players.indexOf(substitute);
  if (index >= 0) this.players.splice(index, 1);

  // replace substitute in list of players
  index = this.players.indexOf(userName);
  this.players[index] = substitute;

  // substitute old player with new
  this.replaceWith(this.matches, userName, undefined);
  this.replaceWith(this.pairings, userName, undefined);
  var opponent = this.substituteIn(substitute);

  // announce that a substitute took place
  this.announce(substitute + " will be subbing in for " + userName + "!");
  this.announce("New match: " + substitute + " vs. " + opponent + "!");
};

Tournament.prototype.replaceWith = function(array, user, withUser, returnNow) {
  var opponent = undefined;
  for (var i = 0; i < array.length; i++) {
    var match = array[i];
    if (match[0] === user) {
      match[0] = withUser;
      opponent = match[1];
      if (returnNow) return opponent;
    } else if (match[1] === user) {
      match[1] = withUser;
      opponent = match[0];
      if (returnNow) return opponent;
    }
  }
  return opponent;
};

Tournament.prototype.stop = function(user) {
  if (this.state !== TOURNAMENT_INACTIVE) {
    this.state = TOURNAMENT_INACTIVE;
    this.round = 0;
    this.announce("The tournament was canceled!");
  } else {
    this.announce(user.id, "There is no tournament running!");
  }
};

Tournament.prototype.isActive = function() {
  return this.state === TOURNAMENT_ACTIVE;
};

return new Tournament();
})();

function User(id) {
  this.id = id;
  this.ip = sys.ip(id);
  this.name = sys.name(id);
  this.auth = sys.auth(id);
  this.registered = sys.dbRegistered(this.name);
  this.muted = false;
  this.lastMessages = [];
  this.lastMessageTime = 0;
  this.idle = sys.away(id);
  this.tier = sys.tier(id);
  this.channelId = 0;
  this.ratedBattles = sys.ratedBattles(this.id) || 0;
  var key = makeKey(this.name, "first-seen");
  this.firstSeen = getValue(key, getTime());
  setValue(key, this.firstSeen);
}

User.prototype.authedFor = function(auth) {
  return this.auth >= auth;
}

User.prototype.run = function(command, args, channelId) {
  this.channelId = channelId;
  if (command in commands) {
    commands[command].apply(this, args);
  }
}

User.prototype.log = function(message) {
  // why is this needed?
  if (!this.lastMessages) {
    this.lastMessages = [];
  }

  if (this.cantTalk(message)) {
    return false;
  }
  
  this.lastMessages.unshift(message);
  if (this.lastMessages.length > 5) {
    this.lastMessages.pop();
  }
  this.lastMessageTime = getTime();
  return true;
}

User.prototype.cantTalk = function(message) {
  if (this.authedFor(MODERATOR)) {
    return false;
  }
  
  if (timeDelta(this.lastMessageTime) < 50) {
    return true;
  }
  // repeated links
  var matches = message.match(/(?:http|https|ftp)\:\/\//gi);
  if (matches && matches.length >= 2) {
    var key = makeKey(this.name, "chat:last-links");
    if (getTime() - getValue(key) < 30 * 1000) {
      var banLength = 5 * 60; // 5 mins
      ban(this.name, getTime() + banLength * 1000);
      announce(this.name + " was automatically banned for " + prettyPrintTime(banLength) + ". (Too many links.)");
    } else {
      kick(this.name);
      announce(this.name + " was automatically kicked for saying one too many links.");
    }
    setValue(key, getTime());
    return true;
  }
  if (this.lastMessages.length > 0) {
    // repeated messages
    if (this.lastMessages[0] === message) {
      kick(this.name);
      return true;
    }
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
    "/dw -- See a list of released Dream World Pokemon.",
    "/tiers -- See a link to Smogon's Tiers.",
    "/clearpass -- Clear your own password.",
    "/auth group:name",
    "/idle -- Sets your status to idle, which blocks challenges. Aliased to /away.",
    "* TOURNAMENT COMMANDS",
    "/join -- Enters you into a tournament if one is running.",
    "/drop -- Removes yourself from a tournament. Aliased to /dropout.",
    "/viewround -- Shows the current round's matchups and subtitutes."
  ], [
    "** MODERATOR COMMANDS",
    "/kick user -- kicks user from the server. Aliased to /k.",
    "/ban user -- bans user for " + MODERATOR_MAX_BAN_LENGTH / 60 / 60 + " hours.",
    "/ban user:duration -- duration is in hours. Maximum of " + MODERATOR_MAX_BAN_LENGTH / 60 / 60 + " hours.",
    "/b is aliased to /ban.",
    "/unban user",
    "/mute -- mutes whole server",
    "/mute user",
    "/mute user:duration",
    "/unmute user",
    "/wall message",
    "/ip user -- returns player's IP address."
  ], [
    "** ADMINISTRATOR COMMANDS",
    "/ban user -- bans user for 1 day.",
    "/ban user:1y2M3w4d5h6m7s -- bans the user for the entered time.",
    "/b is aliased to /ban.",
    "/kickall ip -- kicks all users with given IP address.",
    "/mute user:1y2M3w4d5h6m7s -- mutes the user for the entered time.",
    "/silence -- Silences the entire chat.",
    "/unsilence -- Lifts silence.",
    "/permaban -- Permanently bans a user. Aliased to /pb and /permban.",
    "/topic -- Changes the topic.",
    "* TOURNAMENT COMMANDS",
    "/tour tier:participants -- Starts a tournament.",
    "/drop user -- Removes the user from the tournament. Aliased to /dropout.",
    "/stop -- Stops the current tournament. Aliased to /cancel",
    "/changecount -- Changes the number of participants in a tournament." 
  ], [
    "** OWNER COMMANDS",
    "/resetLadder tier -- resets the ratings for the specified tier.",
    "/resetPlayerRating name:tier -- resets the rating of the user in the tier to 1000.",
    "/clearpass user -- Clear user's password.",
    "/destroy channel -- Deletes a channel.",
    "/stopBattles -- Prevents new battles from starting (useful if server needs to be restarted)."
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
  addAuthCommand(OWNER, commandName, func);
}

addCommand([ "help", "commands" ], function() {
  for (var i = 0; i <= this.auth; i++) {
    for (var j = 0; j < help[i].length; j++) {
      announce(this.id, help[i][j]);
    }
  }
});

addOwnerCommand("mod", function(playerName) {
  changeAuthIfLessThan(playerName, MODERATOR);
});

addOwnerCommand("admin", function(playerName) {
  changeAuthIfLessThan(playerName, ADMINISTRATOR);
});

addOwnerCommand("owner", function(playerName) {
  changeAuthIfLessThan(playerName, OWNER);
});

addOwnerCommand(["deauth", "demod", "deadmin", "deowner"], function(playerName) {
  changeAuth(playerName, USER);
});

addCommand("auth", function(type, token, newAuth) {
  if (type === "group") {
    var group = AUTH_VALUES[token.toUpperCase()];
    var list  = sys.dbAuths();
    list      = findGroupAuthLevel(group, list).sort();
    
    for (var i = 0, len = list.length; i < len; i++) {
      announce(this.id, list[i]);
    }
  } else if (type === "user") {
    if (newAuth) {
      if (this.authedFor(OWNER)) {
        changeAuth(token, newAuth);
        announce(this.id, "You set " + token + "'s authority level to " + newAuth + ".");
      } else {
        announce(this.id, "You're not allowed to set other people's auth!");
      }
    } else {
      var auth = getAuth(token);
      announce(this.id, token + "'s authority level is " + auth + ".");
    }
  } else {
    announce(this.id, "Invalid arguments.");
  }
});

addOwnerCommand("eval", function() {
  var stuff = toArray(arguments);
  sys.eval(stuff.join(":"));
});

addModCommand("say", function() {
  if (this.authedFor(SAY_LEVEL)) {
    var stuff = toArray(arguments).join(":");
    sys.sendAll(stuff, this.channelId);
    announce(this.name + " said, '" + stuff + "'", sys.channelId("Staff"));
  } else {
    announce(this.id, "Current say level is higher than your level.");
  }
});

addModCommand("saylevel", function(level) {
  if (!level) {
    announce(this.id, "Current say level is " + SAY_LEVEL);
  } else if (this.authedFor(SAY_LEVEL)) {
    level = parseInt(level, 10);
    level = Math.min(level, OWNER);
    SAY_LEVEL = level;
    announce(this.id, "Say level set to " + level);
  }
});

addCommand([ "idle", "away"], function() {
  this.idle = !this.idle;
  var status = this.idle ? "idle" : "available";
  sys.changeAway(this.id, this.idle);
  announce(this.id, "You are now " + status + ".");
});

addCommand("ranking", function(player_name) {
  var player = getPlayer(player_name) || this;
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

addAdminCommand("kickall", function(ip) {
  var players = sys.playerIds();
  var players_length = players.length;
  for (var i = 0; i < players_length; ++i) {
    var current_player = players[i];
    if (ip == sys.ip(current_player)) {
      sys.kick(current_player);
    }
  }
});

addModCommand("ip", function(player_name) {
  announce(this.id, player_name + " has ip address " + sys.ip(sys.id(player_name)));
});

addOwnerCommand("hostname", function(player_name){
  announce(this.id, player_name + " has hostname " + sys.hostname(sys.ip(sys.id(player_name)),player_name));
});
addOwnerCommand("reload", function() {
  var id          = this.id;
  var old_scripts = sys.getFileContent(SCRIPTS_URL);
  sys.writeToFile(SCRIPTS_BACKUP_URL, old_scripts);
  
  if (arguments.length > 0) {
    var scriptURL = toArray(arguments).join(":");
    
    sys.webCall(scriptURL, function(res) {
      sys.changeScript(res, true);
      sys.writeToFile(SCRIPTS_URL, res);
      announce(id, "Script reloaded!");
    });
  } else {
    sys.system("curl -k -o " + SCRIPTS_URL + " " + REMOTE_SCRIPT_URL);
    var new_scripts = sys.getFileContent(SCRIPTS_URL);
    sys.changeScript(new_scripts, true);
    announce(id, "Script reloaded!");
  }
});

addOwnerCommand("rollback", function() {
  var id          = this.id;
  var old_scripts = sys.getFileContent(SCRIPTS_BACKUP_URL);
  sys.writeToFile(SCRIPTS_URL, old_scripts);
  sys.changeScript(old_scripts, true);
  announce(id, "Scripts rolled back!");
});

addOwnerCommand("reloadtiers", function() {
  announce(this.id, "Fetching tiers.yml...");
  sys.system("curl -k -o tiers.yml " + REMOTE_TIERS_URL);
  announce(this.id, "Compiling tiers.yml into tiers.xml...");
  // NOTE: Specific to the windows server.
  // This just runs ruby tiers_compiler.rb
  //sys.system("tiers_compiler.bat");
  sys.system("./tiers_compiler.rb");
  announce(this.id, "Reloading tiers.xml on server...");
  sys.reloadTiers();
});

addOwnerCommand("resetLadder", function(tier) {
  sys.resetLadder(tier);
  announce(this.name + " reset the ladder for " + tier);
});

addOwnerCommand("resetPlayerRating", function(player,tier) {
  sys.changeRating(player, tier, 1000);
  announce(this.name + " reset the rating of " + player + " in "+tier);
});

addModCommand("wall", function() {
  var message = toArray(arguments).join(":");
  announce(this.name + ": " + message);
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
    
    message = player_name + " was banned by " + this.name + " for " + prettyPrintTime(length) + ".";
    if (reason) {
      message += " (" + reason + ")";
    }
    announce(message);
    ban(player_name, getTime() + length * 1000);
  }
});

addAdminCommand("silence", function() {
  silence = true;
  announce(this.name + " silenced the chat.");
});

addAdminCommand(["unsilence", "desilence"], function() {
  silence = false;
  announce(this.name + " lifted the silence on the chat.");
});

addAdminCommand(["permban", "permaban", "pb"], function(playerName, reason) {
  var auth = parseInt(sys.dbAuth(playerName), 10);
  if (this.outranks(auth)) {
    var message = playerName + " was banned by " + this.name + " for eternity.";
    if (reason) {
      message += " (" + reason + ")";
    }
    ban(playerName);
    announce(message);
  }
});

addAdminCommand("topic", function() {
  var new_topic = toArray(arguments).join(":");
  
});

addModCommand("unban", function(playerName) {
  var auth    = parseInt(sys.dbAuth(playerName), 10);
  var nameKey = makeKey(playerName, "ban:expires");
  if (this.outranks(auth)) {
    var ip = sys.dbIp(playerName);
    if (ip === undefined) {
      announce(this.id, "No such user!");
    } else if (getValue(nameKey)) {
      sys.unban(playerName);
      deleteValue(nameKey);
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

addCommand("tiers", function() {
  announce(this.id, "Smogon tiers: http://www.smogon.com/bw/tiers");
});

addCommand("dw", function() {
  announce(this.id, "Released Dream World content: http://tinyurl.com/dwareas and http://tinyurl.com/dwpkmn");
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

// destroys a channel.
addOwnerCommand("destroy", function() {
  var channelId = sys.channelId(toArray(arguments).join(":"));
  if (channelId) {
    var players   = sys.playersOfChannel(channelId);
    for (var i = 0, len = players.length; i < len; i++) {
      sys.kick(players[i], channelId);
    }
  }
});

addOwnerCommand("stopBattles", function() {
  battlesStopped = !battlesStopped;
  if (battlesStopped)  {
    announce("");
    announce("*** ********************************************************************** ***");
    announce("The battles are now stopped. The server will restart soon.");
    announce("*** ********************************************************************** ***");
    announce("");
  } else {
    announce("False alarm, battles may continue.");
  } 
});

// Tournament wrappers
addModCommand("tour", function(tier, spots) {
  Tournament.create(this, tier, spots);
});

addCommand(["j", "join"], function() {
  Tournament.join(this);
});

addCommand(["drop", "dropout"], function(userName) {
  if (userName) {
    if (this.authedFor(MODERATOR)) {
      Tournament.drop(this, userName);
    }
  } else {
    Tournament.dropout(this);
  }
});

addCommand(["view", "viewround"], function() {
  Tournament.viewRound(this);
});

addModCommand("changecount", function(newNum) {
  Tournament.changecount(this, newNum);
});

addModCommand("forcewin", function(userName) {
  Tournament.forceWin(this, userName);
});

addModCommand(["sub", "substitute"], function(userName, substitute) {
  Tournament.substitute(userName, substitute);
});

addModCommand(["cancel", "stop"], function() {
  Tournament.stop(this);
});

/*******************\
* Tiers/ban lists   *
\*******************/
var BANS = {};
function makeBan(tier, banObject) {
  if (!BANS[tier]) {
    BANS[tier] = {};
  }
  for (var k in banObject) {
    if (banObject.hasOwnProperty(k)) {
      if (!BANS[tier][k]) {
        BANS[tier][k] = [];
      }
      var array = banObject[k];
      for (var i = 0; i < array.length; i++) {
        if (BANS[tier][k].indexOf(array[i]) === -1) {
          BANS[tier][k].push(array[i]);
        }
      }
    }
  }
}

function makeBlanketBan(banObject) {
  var tierList = sys.getTierList();
  for (var k in tierList) {
    if (banObject.hasOwnProperty(k)) {
      makeBan(k, banObject);
    }
  }
}

function hasValidTier(playerName, toTier) {
  var banObject = BANS[toTier];
  var counter = 0;
  for (var k in banObject) {
    if (banObject.hasOwnProperty(k)) {
      counter++;
    }
  }
  
  for (var i = 0; i < 6; i++) {
    var ability = sys.ability(sys.teamPokeAbility(sys.id(playerName), i));
    var index   = banObject.abilities.indexOf(ability);
    if (index !== -1) {
      banObject.abilities.splice(index, 1);
      counter--;
    }
  }
  
  return counter > 0;
}

makeBan("Standard OU", {
  abilities : [ "Drizzle", "Swift Swim" ]
});

makeBlanketBan({
  abilities : [ "Moody" ]
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
  var banKey = makeKey(playerName, "ban:expires");
  setValue(banKey, expires || 0);
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
    var first = parseInt(groups[i], 10);
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
    var userAuth = sys.dbAuth(userName);
    if (userAuth == auth) {
      var status = userId ? " (Online)" : "";
      arr.push(userName + status);
    }
  }
  return arr;
}

function changeAuth(playerName, newAuth) {
  var player = getPlayer(playerName);
  sys.changeDbAuth(playerName, newAuth);
  if (player) {
    player.auth = newAuth;
    sys.changeAuth(player.id, newAuth);
  }
}

function changeAuthIfLessThan(playerName, newAuth, permanent) {
  if (getAuth(playerName) < newAuth) {
    changeAuth(playerName, newAuth, permanent);
  }
}

function getAuth(playerName) {
  var id = sys.id(playerName);
  if (id) {
    return sys.auth(id);
  } else {
    return sys.dbAuth(playerName);
  }
}

/*******************\
* Chat helpers      *
\*******************/
function announce(player_id, message, channelId) {
  var length = arguments.length;
  if (length === 1) {
    message = player_id;
    sys.sendAll("*** " + message);
  } else if (length === 2) {
    if (typeof(player_id) !== "number" && !(/^\d+$/.test(player_id))) {
      channelId = message;
      message   = player_id;
      player_id = undefined;
    }
    if (channelId !== undefined) {
      sys.sendAll("*** " + message, channelId);
    } else {
      sys.sendMessage(player_id, "*** " + message);
    }
  } else {
    sys.sendMessage(player_id, "*** " + message, channelId);
  }
}

function announceHTML(player_id, message, channelId) {
  var length = arguments.length;
  if (length === 1) {
    message = player_id;
    sys.sendHtmlAll("*** " + message);
  } else if (length === 2) {
    if (typeof(player_id) !== "number" && !(/^\d+$/.test(player_id))) {
      channelId = message;
      message   = player_id;
      player_id = undefined;
    }
    if (channelId !== undefined) {
      sys.sendHtmlAll("*** " + message, channelId);
    } else {
      sys.sendHtmlMessage(player_id, "*** " + message);
    }
  } else {
    sys.sendHtmlMessage(player_id, "*** " + message, channelId);
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

function inArray(array, element) {
  for (var i = 0, len = array.length; i < len; i++) {
    if (array[i] == element) {
      return true;
    }
  }
  return false;
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
  
  loadDreamWorldPokemon();
  
  sys.createChannel("Tournaments");
  sys.createChannel("Staff");
  //sys.createChannel("Android Channel");
}

function beforeLogIn(player_id) {
  var player_name = sys.name(player_id);
  if (/[^\w-\[\]\. ]/g.test(player_name)) {
    announce(player_id, "Please do not use special characters in your name.");
    sys.stopEvent();
    return;
  }
  
  HiMobileUser(player_id,sys.tier(player_id));
  
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
  /*var key     = makeKey(user.name, "muted");
  var expired = parseInt(getValue(key, 0), 10);
  if (expired > getTime()) {
    user.muted = true;
  } else {
    deleteValue(key);
  }*/
  
  joinChannels(user);
  afterChangeTeam(player_id);
  
}

function joinChannels(user) {
  if (user.authedFor(MODERATOR)) {
    sys.putInChannel(user.id, sys.channelId("Staff"));
  }
  sys.putInChannel(user.id, sys.channelId("Tournaments"));
}

function droughtCheck(src, tier){
if (!tier) tier = sys.tier(src);
    if (tier != "Standard UU") return; 
    for(var i = 0; i <6; ++i){
        if(sys.ability(sys.teamPokeAbility(src, i)) == "Drought"){
        announce(src, "Drought is not allowed in Standard UU")
      sys.stopEvent()
        sys.changeTier(src, "StreetPKMN")
        return;
        }
    }
}
function SmashPassBan(src,tier) {
    var bp = sys.moveNum("Baton Pass");
    var ss = sys.moveNum("Shell Smash");
    for (var i = 0; i < 6; ++i)
        if ((tier == "Standard RU" || tier == "Standard NU") && sys.hasTeamPokeMove(src,i,ss) && sys.hasTeamPokeMove(src,i,bp)) {

            announce(src,"SmashPass is banned from RU and NU");
            sys.changeTier(src, "Challenge Cup");
            sys.stopEvent();
            return
        }
}

function HiMobileUser(src,tier) {
    var cleffa = sys.pokeNum("Cleffa");
    var splash = sys.moveNum("Splash");
    //var missingno = sys.pokeNum("Missingo");
    if ((tier != "Challenge Cup") && (sys.teamPoke(src,0) == cleffa) && sys.hasTeamPokeMove(src,0,splash) && sys.teamPokeNick(src, 0) == "LOLZ") {
      /*var AndChan =  sys.channelId("Tournaments");
      if (sys.existChannel("Android Channel")) {
        AndChan = sys.channelId("Android Channel");
        sys.putInChannel(src, AndChan);
      }
      
      sys.sendMessage(src, "Hello, Android user! The application that you have downloaded is a pirated copy of a freeware program. Please uninstall it and go to http:\/\/www.pokemon-online.eu to find out more about this program and to download the REAL version, which has no ads.",AndChan);
      sys.changeTier(src, "Challenge Cup");*/
      sys.kick(src);
      return true;
    }
  else {
    return false;
  }
}


function swiftSwimCheck(src, tier){
    if (!tier) tier = sys.tier(src);
    if (tier != "Standard OU") return; 
    for(var i = 0; i <6; ++i){
        if(sys.ability(sys.teamPokeAbility(src, i)) == "Drizzle"){
            for(var j = 0; j <6; ++j){
                if(sys.ability(sys.teamPokeAbility(src, j)) == "Swift Swim"){
                    announce(src, "You cannot have the combination of Swift Swim and Drizzle in Standard OU");
                    sys.stopEvent();
                    sys.changeTier(src, "StreetPKMN");
                    return;
                }
            }
        }
    }
}

function dreamWorldAbilitiesCheck(src, se) {
    if (sys.gen(src) < 5)
        return;

    if (["StreetPKMN", "Dream World OU", "Dream World Ubers", "Challenge Cup"].indexOf(sys.tier(src)) != -1) {
        return; // don't care about these tiers
    }

    for (var i = 0; i < 6; i++) {
        var x = sys.teamPoke(src, i);
        if (x != 0 && sys.hasDreamWorldAbility(src, i)  && (!(x in dreamWorldPokemon) || (breedingpokemons.indexOf(x) != -1  && sys.compatibleAsDreamWorldEvent(src, i) != true))) {
            if (se) {
                if (!(x in dreamWorldPokemon))
                    announce(src, "" + sys.pokemon(x) + " is  not allowed with a Dream World ability in this tier. Change it in the  teambuilder.");
                else
                    announce(src, "" + sys.pokemon(x) + "  has to be Male and have no egg moves with its Dream World ability in  " +  sys.tier(src) + " tier. Change it in the teambuilder.");
            }
            if (sys.tier(src) == "Standard OU" && sys.hasLegalTeamForTier(src, "Dream World OU")) {
                sys.changeTier(src, "Dream World OU");
            } else if (sys.tier(src) == "Standard OU" && sys.hasLegalTeamForTier(src, "Dream World Ubers")) {
                sys.changeTier(src, "Dream World Ubers");
            } else if (sys.tier(src) == "Standard Ubers") {
                sys.changeTier(src, "Dream World Ubers");
            }
            else if (sys.tier(src) == "Standard UU" && sys.hasLegalTeamForTier(src, "Dream World OU")) {
                sys.changeTier(src, "Dream World OU");
            }
            else if (sys.tier(src) == "Standard UU" && sys.hasLegalTeamForTier(src, "Dream World Ubers")) {
                sys.changeTier(src, "Dream World Ubers");
            }
            else if (sys.tier(src) == "Standard RU" && sys.hasLegalTeamForTier(src, "Dream World OU")) {
                sys.changeTier(src, "Dream World OU");
            } else if (sys.tier(src) == "Standard RU" && sys.hasLegalTeamForTier(src, "Dream World Ubers")) {
                sys.changeTier(src, "Dream World Ubers");
            }
            else if (sys.tier(src) == "Standard LC" && sys.hasLegalTeamForTier(src, "Dream World OU")) {
                sys.changeTier(src, "Dream World OU");
            }else {
                if (se)
                    sys.changePokeNum(src, i, 0);

            }
            if (se)
                sys.stopEvent();
        }
    }
}
var inpokemons = ["Remoraid", "Bidoof", "Snorunt", "Smeargle", "Bibarel", "Octillery", "Glalie"];

for(var i = 0; i < inpokemons.length; i++) {
  inpokemons[i] = sys.pokeNum(inpokemons[i]);
}

function loadDreamWorldPokemon() {
  var pokemonList = sys.getFileContent("dwpokemon.txt").split(/\s*\n\s*/);
  for (var i = 0, len = pokemonList.length; i < len; i++) {
    var pokemonName = pokemonList[i];
    if (pokemonName in pokemonHash) {
      dreamWorldPokemon[pokemonHash[pokemonName]] = pokemonName;
    }
  }
}

var breedingpokemons = ["Bulbasaur", "Ivysaur", "Venusaur", "Charmander", "Charmeleon", "Charizard", "Squirtle", "Wartortle", "Blastoise", "Croagunk", "Toxicroak", "Turtwig", "Grotle", "Torterra", "Chimchar", "Monferno", "Infernape", "Piplup", "Prinplup", "Empoleon", "Treecko", "Grovyle", "Sceptile", "Torchic", "Combusken", "Blaziken", "Mudkip", "Marshtomp", "Swampert", "Mamoswine", "Togekiss"];
breedingpokemons = breedingpokemons.map(function(p) { return sys.pokeNum(p); });

function moodyCheck(src, se) {
    if (["Standard Uber, Standard OU, Standard UU, Standard RU, Standard LC"].indexOf(sys.tier(src)) == -1) {
        return; // only care about these tiers
    }
    for (var i = 0; i < 6; i++) {
        var x = sys.teamPoke(src, i);

        if (x != 0 && inpokemons.indexOf(x) != -1 && sys.hasDreamWorldAbility(src, i)) {
            if (se)
                announce(src, "+CheckBot: " + sys.pokemon(x) + "   is not allowed with Moody in this tier. Change it in the  teambuilder.");
                sys.changeTier(src, "StreetPKMN");
            if (se)
                sys.stopEvent();
        }
    }
}

function afterChangeTeam(playerId) {
  var user = SESSION.users(playerId);
  user.name = sys.name(playerId);
  user.tier = sys.tier(playerId);
  dreamWorldAbilitiesCheck(playerId, false);
  //moodyCheck(playerId, false);
  swiftSwimCheck(playerId);
  //droughtCheck(playerId);
  SmashPassBan(playerId,sys.tier(playerId));

  if (/[^\w-\[\]\. ]/g.test(user.name)) {
    announce(playerId, "Please do not use special characters in your name.");
    kick(user.name);
  }
}

function afterBattleEnded(winnerId, loserId, result, battleId) {
  if (Tournament.isActive() && result !== "tie") {
    winner = SESSION.users(winnerId);
    loser  = SESSION.users(loserId);
    if (sys.tier(winnerId) === sys.tier(loserId) && sys.tier(winnerId) === Tournament.tier) {
      Tournament.tick(winner.name, loser.name);
    }
  }
}

function beforeBattleMatchup(src, dest, clauses, rated, mode) {
  if (battlesStopped) {
        announce(src, "Battles are now stopped as the server will restart soon.");
        sys.stopEvent();
        return;
  }
  if (sys.tier(src) == sys.tier(dest)) {
    dreamWorldAbilitiesCheck(src, true);
    dreamWorldAbilitiesCheck(dest, true);
    //moodyCheck(src, true);
    //moodyCheck(dest, true);
  }
}

function beforeChallengeIssued(sourceId, targetId, clauses, rated, mode) {
  if (battlesStopped) {
        announce(src, "Battles are now stopped as the server will restart soon.");
        sys.stopEvent();
        return;
  }
  if (sys.tier(sourceId) == sys.tier(targetId)) {
    dreamWorldAbilitiesCheck(sourceId, true);
    dreamWorldAbilitiesCheck(targetId, true);
    //moodyCheck(sourceId, true);
    //moodyCheck(targetId, true);
  }
  var source = sys.name(sourceId);
  var target = sys.name(targetId);
  if (Tournament.isActive() && Tournament.isTourBattle(source, target)) {
    if (sys.tier(sourceId) === sys.tier(targetId) && sys.tier(sourceId) === Tournament.tier) {
      Tournament.announce(sourceId, "This battle will count for the tournament!");
      Tournament.announce(targetId, "This battle will count for the tournament!");
    } else {
      Tournament.announceHTML(sourceId, "<span style='color: red; font-weight: bold;'>This battle isn't in " + Tournament.tier + "! This battle was stopped.");
      sys.stopEvent();
    }
  }
}

function beforeChangeTier(playerId, oldTier, newTier) {
  swiftSwimCheck(playerId, newTier);
  droughtCheck(playerId, newTier);
  SmashPassBan(playerId,newTier);
  /*
  if (!hasValidTier(playerId, newTier)) {
    sys.stopEvent();
    announce(playerId, "You cannot switch to this tier.");
  }
  */
}

function beforeChannelCreated(channelId, channelName, playerId) {
  if (playerId !== undefined) {
    var user = SESSION.users(playerId);
    if (user && !user.authedFor(MODERATOR) && channelName != MAIN_CHANNEL) {
      sys.stopEvent();
    }
  }
}

function beforeChatMessage(player_id, message, channelId) {
  var user = SESSION.users(player_id);
  message  = sanitize(message);
  sys.stopEvent();
  if (message.length === 0) {
    return;
  }

  if (message.length > 200) {
    announce(player_id, "You talk too much.");
    return;
  }
  
  if (message[0] === '/' && message.length > 1) {
    message     = message.substr(1);
    var pieces  = message.split(/\s+/);
    var command = pieces.shift();
    pieces      = compact(pieces.join(" ").split(":"));
    user.run(command, pieces, channelId);
    return;
  }
  
  if (user.muted) {
    return;
  }
  
  if (!user.authedFor(MODERATOR) && silence) {
    return;
  }
  
  if (!user.log(message)) {
    // can't talk
    return;
  }
  sys.sendAll(user.name + ": " + message, channelId);
}

// persist Tournaments/Staff channel
function beforeChannelDestroyed(channelId) {
  var channelName    = sys.channel(channelId);
  var indestructible = [ "Staff", "Tournaments" ];
  if (indestructible.indexOf(channelName) !== -1) {
    sys.stopEvent();
  }
}

function afterChannelJoin(playerId, channelId) {
  if (playerId !== undefined) {
    var channel = sys.channel(channelId);
    var user    = SESSION.users(playerId);
    if (user && Tournament.isActive()) {
      Tournament.viewRound(user);
    }
  }
}

function beforeChannelJoin(playerId, channelId) {
  if (playerId !== undefined) {
    var channel = sys.channel(channelId);
    var user    = SESSION.users(playerId);
    if (user && !user.authedFor(MODERATOR) && channel === "Staff") {
      sys.stopEvent();
    }
  }
}

function afterChangeTier(playerId, oldTier, newTier) {
  if (playerId !== undefined) {
    var user = SESSION.users(playerId);
    if (user) {
      user.tier = newTier;
    }
  }
}

({
  serverStartUp          : serverStartUp,
  beforeLogIn            : beforeLogIn,
  afterLogIn             : afterLogIn,
  afterBattleEnded       : afterBattleEnded,
  afterChangeTeam        : afterChangeTeam,
  afterChannelJoin       : afterChannelJoin,
  afterChangeTier        : afterChangeTier,
  beforeBattleMatchup    : beforeBattleMatchup,
  beforeChallengeIssued  : beforeChallengeIssued,
  beforeChannelDestroyed : beforeChannelDestroyed,
  beforeChannelJoin      : beforeChannelJoin,
  beforeChangeTier       : beforeChangeTier,
  beforeChannelCreated   : beforeChannelCreated,
  beforeChatMessage      : beforeChatMessage
})
