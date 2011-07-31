# Pokemon Online server scripts

Made for the popular Pokemon simulator, [Pokemon Online](pokemon-online.eu).

## Commands

Stuff in braces -- `{}` -- mean you should type something there instead, excluding the braces.

Stuff in brackets -- `[]` -- are optional.

### Regular users

* `/ranking`  
  See your own ranking

* `/ranking {name}`  
  See name's ranking

* `/clearpass`  
  Clear your own password.

* `/auth group:{group name}`  
  Finds all users under that group. Groups: moderator/mod, administrator/admin, and owner.

* `/auth user:{name}`  
  Finds the auth level of that user.

### Moderators

* `/kick {user}`  
  -- Kicks the user. This is also aliased to /k.

* `/ban {user}`  
  Bans user for the maximum amount of time moderators can ban for (default: 3 hours). Aliased to /b.

* `/ban {user}:{duration}`  
  Bans user temporarily. Provide a modifier for more fine-tuning.  
  Ex. /ban BagAeolus:1h3m2s bans BagAeolus for 1 hour, 3 minutes, and 2 seconds.

* `/unban {user}`  
  Reverses the ban on user.

* `/wall {message}`  
  Sends a message outlined in red for all to see.

### Administrators

* `/ban {user}`  
  Bans forever. Aliased to /b.

### Owners

* `/clearpass {user}`  
  Clears user's password.

* `/reload [url]`  
  Reloads from this github URL by default, or from url if specified. Note that you must have `curl` installed to reload from github.

## x command doesn't work!

Please [submit a bug report](https://github.com/sarenji/poserver/issues) and a developer will get right on it.