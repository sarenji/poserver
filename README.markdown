# Pokemon Online server scripts

Made for the popular Pokemon simulator, [Pokemon Online](pokemon-online.eu).

## Commands

Stuff in braces -- `{}` -- mean you should type something there instead, excluding the braces.

Stuff in brackets -- `[]` -- are optional.

### Regular user commands

* `/ranking`  
  See your own ranking

* `/ranking {name}`  
  See name's ranking

* `/clearpass`  
  Clear your own password.

* `/idle` or `/away`
  Toggles your idle status.

* `/auth group:{group name}`  
  Finds all users under that group. Groups: moderator/mod, administrator/admin, and owner.

* `/auth user:{name}`  
  Finds the auth level of that user.

### Moderator commands

* `/kick {user}[:reason]`  
  Kicks the user. Reason is optional. This is also aliased to /k.

* `/ban {user}[:reason]`  
  Bans user for 3 hours. Aliased to /b.

* `/ban {user}[:duration][:reason]`  
  Bans user temporarily. Provide a modifier for more fine-tuning.  
  Ex. `/ban BagAeolus:1h3m2s` bans BagAeolus for 1 hour, 3 minutes, and 2 seconds.

* `/unban {user}`  
  Reverses the ban on user.

* `/mute {user}`  
  Mutes user until the user signs out.

* `/mute {user}:{duration}`
  Mutes user for a time. The user continues to be muted even after signing off.
  Ex. `/mute BagAeolus:1y` mutes BagAeolus for one year, even if BagAeolus signs off.

* `/unmute {user}`
  Unmutes the user.

* `/wall {message}`  
  Sends a message outlined in red for all to see.

### Possible time modifiers

* `s`: seconds
* `m`: minutes
* `h`: hours (default if no modifier provided)
* `d`: days
* `w`: weeks
* `M`: months
* `y`: years

### Administrator commands

* `/permaban {user}[:reason]` or `/permban {user}[:reason]` or `/pb {user}[:reason]`  
  Bans forever.

### Owner commands

* `/clearpass {user}`  
  Clears user's password.

* `/reload [url]`  
  Reloads from this github URL by default, or from url if specified. Note that you must have `curl` installed to reload from github.

## x command doesn't work!

Please [submit a bug report](https://github.com/sarenji/poserver/issues) and a developer will get right on it.