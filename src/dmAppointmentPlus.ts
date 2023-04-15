import { MachineConfig, send, Action, assign } from "xstate";


function say(text: string): Action<SDSContext, SDSEvent> {
  return send((_context: SDSContext) => ({ type: "SPEAK", value: text }));
}

interface Grammar {
  [index: string]: {
    intent: string;
    entities: {
      [index: string]: string;
    };
  };
}

const thresholdCheck = (context: SDSContext) => {
  if (context.recResult[0].confidence > 0.75) {
    return true;
  }
  return false;
};

const augmentTimeout = (context: SDSContext) => {
  return (context.timeout_count + 1);
};

const getNLUResult = (context: SDSContext) => {
  let nlu_result = context.nluResult.prediction.topIntent;
  return nlu_result;
};

const formatTime = (context: SDSContext) => {
  let u = context.recResult[0].utterance.toLowerCase().replace(/\.$/g, "");
  //matching a regular expression and returning the time.
  regex_match = u.match(/(at|around){0, 1} .*( o'clock){0, 1}/);
  if (regex_match) {
    return regex_match[0];
  };
  return "some time";
};

const formatDay = (context: SDSContext) => {
  let u = context.recResult[0].utterance.toLowerCase().replace(/\.$/g, "");
  //matching a regular expression and returning the name of the day.
  regex_match = u.match(/[a-z]*day/);
  if (regex_match) {
    return regex_match[0];
  };
  return "day";
};

const formatTitle = (context: SDSContext) => {
  let u = context.recResult[0].utterance.toLowerCase().replace(/\.$/g, "");
  //matching a regular expression and returning the name of the meeting's name.
  regex_match = u.match(/.*/);
  if (regex_match) {
    return regex_match[0];
  };
  return "this";
};

const isWho = (context: SDSContext) => {
  let u = context.recResult[0].utterance.toLowerCase().replace(/\.$/g, "");
  return u.includes("who is");
};

const getName = (context: SDSContext) => {
  let u = context.recResult[0].utterance.toLowerCase().replace(/\.$/g, "");
  return u.replace("who is", "");
};

/*

function counter(x) {
  count += x;
  if (count > 3) {
    count = 0;
    return;
  }
  return ".prompt";
};

*/

export const dmMachine: MachineConfig<SDSContext, any, SDSEvent> = {
  initial: "idle",
  states: {
    idle: {
      on: {
        CLICK: "init",
      },
    },
    init: {
      id: "init",
      on: {
        TTS_READY: "menu",
        CLICK: "menu",
      },
    },
    menu: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "whois",
            cond: ((context) => getNLUResult(context) === "want_person" && thresholdCheck(context) === true),
            actions: assign({timeout_count: 0}),
          },
          {
            target: "welcome",
            cond: ((context) => getNLUResult(context) === "want_person" && thresholdCheck(context) === true),
            actions: assign({timeout_count: 0}),
          },
          {
            target: ".notsure", 
            cond: ((context) => getNLUResult(context) === "want_person" && thresholdCheck(context) === false),
            actions: [
              assign({timeout_count: 0}),
              assign({last_state: "want_person"}),
            ],
          },
          {
            target: ".notsure", 
            cond: ((context) => getNLUResult(context) === "want_meeting" && thresholdCheck(context) === false),
            actions: [
              assign({timeout_count: 0}),
              assign({last_state: "want_meeting"}),
            ],
          },
          {
            target: "whois",
            cond: ((context) => getNLUResult(context) === "affirm" &&  context.last_state === "want_person"),
            actions: assign({timeout_count: 0}),
          },
          {
            target: "welcome",
            cond: ((context) => getNLUResult(context) === "affirm" &&  context.last_state === "want_meeting"),
            actions: assign({timeout_count: 0}),
          },
          {
            target: ".help",
            cond: ((context) => getNLUResult(context) === "help" || getNLUResult(context) === "reject"),
            actions: assign({timeout_count: 0}),
          },
          {
            target: ".nomatch",
            actions: assign({timeout_count: 0}),
          },
        ],
        TIMEOUT: [
          {
            target: ".youthere", 
            cond: (context) => context.timeout_count < 3,
            actions: assign({timeout_count: (context) => augmentTimeout(context) }),
          },
          {
            target: ".restart",
            cond: (context) => context.timeout_count >= 3,
          },
          {
            target: ".youthere",
            actions: assign({timeout_count: 1}),
          },
        ],
      },
      states: {
        prompt: {
          entry: say(`Hello! Do you want to find out who somebody is or do you want to schedule something?`),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        help: {
          entry: say(`I will ask about it once again, hopefully this helps.`),
          on: { ENDSPEECH: "prompt"},
        },
        nomatch: {
          entry: say(`Sorry, I don't think I'm able to do that. Please try again.`),
          on: { ENDSPEECH: "ask" },
        },
        youthere: {
          entry: say(`Are you there? What do you want to do?`), 
          on: { ENDSPEECH: "ask" },
        },
        notsure: {
          entry: send((context) => ({
            type: "SPEAK",
            value: `Did you say ${context.recResult[0].utterance.toLowerCase().replace(/\.$/g, "")}?`,
          })),
          on: { ENDSPEECH: "ask" }, 
        },
        restart: {
          entry: say(`Seems like you're not there. Bye, see you when you're back!`),
          on: { ENDSPEECH: "#init" },
        },
      },
    },
    whois: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: ".help",
            cond: ((context) => getNLUResult(context) === "help" || getNLUResult(context) === "reject"),
            actions: assign({timeout_count: 0}),
          },
          {
            target: "whotheyare",
            cond: ((context) => isWho(context) && thresholdCheck(context) === true),
            actions: [
              assign({person: (context) => getName(context)}),
              assign({timeout_count: 0}),
            ],
          },
          {
            target: ".notsure", 
            cond: ((context) => isWho(context) && thresholdCheck(context) === false),
            actions: [
              assign({timeout_count: 0}),
              assign({last_state: "whois"}),
            ],
          },
          {
            target: "whotheyare",
            cond: ((context) => getNLUResult(context) === "affirm" && context.last_state === "whois"),
            actions: [
              assign({timeout_count: 0}),
              assign({person: (context) => getName(context)}),
            ],
          },
          {
            target: ".nomatch",
            actions: assign({timeout_count: 0}),
          },
        ],
        TIMEOUT: [
          {
            target: ".youthere", 
            cond: (context) => context.timeout_count < 3,
            actions: assign({timeout_count: (context) => augmentTimeout(context) }),
          },
          {
            target: ".restart",
            cond: (context) => context.timeout_count >= 3,
          },
        ],
      },
      states: {
        prompt: {
          entry: say(`Who do you want to find out about?`),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        help: {
          entry: say(`I will ask about it once again, hopefully this helps.`),
          on: { ENDSPEECH: "prompt"},
        },
        nomatch: {
          entry: say(`Sorry, I don't know them. Please try again.`),
          on: { ENDSPEECH: "ask" },
        },
        youthere: {
          entry: say(`Are you there? Who do you want to find out about?`), 
          on: { ENDSPEECH: "ask" },
        },
        notsure: {
          entry: send((context) => ({
            type: "SPEAK",
            value: `Did you say ${context.recResult[0].utterance.toLowerCase().replace(/\.$/g, "")}?`,
          })),
          on: { ENDSPEECH: "ask" }, 
        },
        restart: {
          entry: say(`Seems like you're not there. Bye, see you when you're back!`),
          on: { ENDSPEECH: "#init" },
        },
      },
    },
    whotheyare: {
      initial: "loading",
      states: {
        loading: {
          invoke: {
            id: 'Abstract',
            src: (context, event) => kbRequest(context.person),
          onDone: {
              target: 'success',
              actions: assign({
                personinfo: (context, event) => {return event.data.Abstract;},
              }), 
            },
            onError: {
              target: 'failure',
            },
          },
        },
        success: {
          entry: send((context) => ({
            type: "SPEAK",
            value: `Here is what I know about ${context.person}: ${context.personinfo}`,
            })),
          type: 'final',
        },
        failure: {
          entry: say(`Sorry, I can't find anything about them. I'll try searching some resources again.`),
	    on: {ENDSPEECH: "loading"}
        },
      },
      onDone: "wannameetthem",
    },
    wannameetthem: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "day_of_the_week",
            cond: (context) => getNLUResult(context) === 'affirm',
            actions: [
              assign({title: (context) => formatTitle(`a meeting with ${context.person}`)}),
              assign({timeout_count: 0}),
            ],
          },
          {
            target: ".help",
            cond: (context) => getNLUResult(context) === "help",
            actions: assign({timeout_count: 0}),
          },
          {
            target: "endline2",
            cond: (context) => getNLUResult(context) === 'reject',
          },
          {
            target: ".nomatch",
            actions: assign({timeout_count: 0}),
          },
        ],
        TIMEOUT: [
          {
            target: ".youthere", 
            cond: (context) => context.timeout_count < 3,
            actions: assign({timeout_count: (context) => augmentTimeout(context) }),
          },
          {
            target: ".restart",
            cond: (context) => context.timeout_count >= 3,
          },
        ],
      },
      states: {
        prompt: {
          entry: say(`Do you want to set up a meeting with them?`),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        help: {
          entry: say(`I will say it once again, hopefully this helps.`),
          on: { ENDSPEECH: "prompt"},
        },
        nomatch: {
          entry: say(`Sorry, I didn't get that. Please try again.`),
          on: { ENDSPEECH: "ask" },
        },
        youthere: {
          entry: say(`Are you there? Do you want to meet them?`), 
          on: { ENDSPEECH: "ask" },
        },
        restart: {
          entry: say(`Seems like you're not there. Bye, see you when you're back!`),
          on: { ENDSPEECH: "#init" },
        },
      },
    },
    welcome: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: ".help",
            cond: (context) => getNLUResult(context) === "help",
            actions: assign({timeout_count: 0}),
          },
          {
            target: "info",
            actions: [
              assign({title: (context) => formatTitle(context)}),
              assign({timeout_count: 0}),
            ],
          },
        ],
        TIMEOUT: [
          {
            target: ".youthere", 
            cond: (context) => context.timeout_count < 3,
            actions: assign({timeout_count: (context) => augmentTimeout(context) }),
          },
          {
            target: ".restart",
            cond: (context) => context.timeout_count >= 3,
          },
        ],
      },
      states: {
        prompt: {
          entry: say(`Please tell me how I shall call this thing.`),
          on: { ENDSPEECH: "ask" },
        },
        help: {
          entry: say(`I will say it once again, hopefully this helps.`),
          on: { ENDSPEECH: "prompt"},
        },
        ask: {
          entry: send("LISTEN"),
        },
        youthere: {
          entry: say(`Are you there? Do you want to meet them?`), 
          on: { ENDSPEECH: "ask" },
        },
        restart: {
          entry: say(`Seems like you're not there. Bye, see you when you're back!`),
          on: { ENDSPEECH: "#init" },
        },
      },
    },
    info: {
      entry: send((context) => ({
        type: "SPEAK", 
        value: `Ok, let's schedule ${context.title}!`, })),
      on: { ENDSPEECH: "day_of_the_week" },
    },
    day_of_the_week: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: ".help",
            cond: ((context) => getNLUResult(context) === "help" || getNLUResult(context) === "reject"),
            actions: assign({timeout_count: 0}),
          },
          {
            target: "duration",
            cond: ((context) => getNLUResult(context) === "day" && thresholdCheck(context) === true),
            actions: [
              assign({day: (context) => formatDay(context)}),
              assign({timeout_count: 0}),
            ],
          },
          {
            target: ".notsure", 
            cond: ((context) => getNLUResult(context) === "day" && thresholdCheck(context) === false),
            actions: [
              assign({timeout_count: 0}),
              assign({last_state: "day"}),
            ],
          },
          {
            target: "duration",
            cond: ((context) => getNLUResult(context) === "affirm" && context.last_state === "day"),
            actions: [
              assign({timeout_count: 0}),
              assign({day: (context) => formatDay(context)}),
            ],
          },
          {
            target: ".nomatch",
            actions: assign({timeout_count: 0}),
          },
        ],
        TIMEOUT: [
          {
            target: ".youthere", 
            cond: (context) => context.timeout_count < 3,
            actions: assign({timeout_count: (context) => augmentTimeout(context) }),
          },
          {
            target: ".restart",
            cond: (context) => context.timeout_count >= 3,
          },
        ],
      },
      states: {
        prompt: {
          entry: say(`What day of the week do you want the meeting on?`),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        help: {
          entry: say(`I will say it once again, hopefully this helps.`),
          on: { ENDSPEECH: "prompt"},
        },
        nomatch: {
          entry: say(`Sorry, I didn't get what you mean. On what day?`),
          on: { ENDSPEECH: "ask" },
        },
        youthere: {
          entry: say(`Are you there? What day is fine?`), 
          on: { ENDSPEECH: "ask" },
        },
        notsure: {
          entry: send((context) => ({
            type: "SPEAK",
            value: `Did you say ${context.recResult[0].utterance.toLowerCase().replace(/\.$/g, "")}?`,
          })),
          on: { ENDSPEECH: "ask" }, 
        },
        restart: {
          entry: say(`Seems like you're not there. Bye, see you when you're back!`),
          on: { ENDSPEECH: "#init" },
        },
      },
    },
    duration: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "confirmation_whole_day",
            cond: (context) => getNLUResult(context) === "affirm",
            actions: assign({timeout_count: 0}),
          },
          {
            target: ".help",
            cond: (context) => getNLUResult(context) === "help",
            actions: assign({timeout_count: 0}),
          },
          {
            target: "meeting_time",
            cond: (context) => getNLUResult(context) === "reject",
            actions: assign({timeout_count: 0}),
          },
          {
            target: ".nomatch",
            actions: assign({timeout_count: 0}),
          },
        ],
        TIMEOUT: [
          {
            target: ".youthere", 
            cond: (context) => context.timeout_count < 3,
            actions: assign({timeout_count: (context) => augmentTimeout(context) }),
          },
          {
            target: ".restart",
            cond: (context) => context.timeout_count >= 3,
          },
        ],
      },
      states: {
        prompt: {
          entry: say(`Do you want your meeting to be scheduled for the whole day?`),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        help: {
          entry: say(`I will say it once again, hopefully this helps.`),
          on: { ENDSPEECH: "prompt"},
        },
        nomatch: {
          entry: say(`Sorry, I didn't get what you mean. Please try again.`),
          on: { ENDSPEECH: "ask" },
        },
        youthere: {
          entry: say(`Are you there? Shall I schedule this for the whole day?`), 
          on: { ENDSPEECH: "ask" },
        },
        restart: {
          entry: say(`Seems like you're not there. Bye, see you when you're back!`),
          on: { ENDSPEECH: "#init" },
        },
      },
    },
    meeting_time: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "confirmation_time",
            cond: (context) => getNLUResult(context) === "time",
            actions: [
              assign({time: (context) => formatTime(context)}),
              assign({timeout_count: 0}),
            ],
          },
          {
            target: ".help",
            cond: ((context) => getNLUResult(context) === "help" || getNLUResult(context) === "reject"),
            actions: assign({timeout_count: 0}),
          },
          {
            target: "confirmation_time",
            cond: ((context) => getNLUResult(context) === "time" && thresholdCheck(context) === true),
            actions: [
              assign({time: (context) => formatTime(context)}),
              assign({timeout_count: 0}),
            ],
          },
          {
            target: ".notsure", 
            cond: ((context) => getNLUResult(context) === "time" && thresholdCheck(context) === false),
            actions: [
              assign({timeout_count: 0}),
              assign({last_state: "time"}),
            ],
          },
          {
            target: "confirmation_time",
            cond: ((context) => getNLUResult(context) === "affirm" && context.last_state === "time"),
            actions: [
              assign({timeout_count: 0}),
              assign({time: (context) => formatTime(context)}),
            ],
          },
          {
            target: ".nomatch",
          },
        ],
        TIMEOUT: [
          {
            target: ".youthere", 
            cond: (context) => context.timeout_count < 3,
            actions: assign({timeout_count: (context) => augmentTimeout(context) }),
          },
          {
            target: ".restart",
            cond: (context) => context.timeout_count >= 3,
          },
        ],
      },
      states: {
        prompt: {
          entry: say(`What time shall the meeting be?`),
          on: { ENDSPEECH: "ask" },
        },
        help: {
          entry: say(`I will say it once again, hopefully this helps.`),
          on: { ENDSPEECH: "prompt"},
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          entry: say(`Sorry, I didn't get what you mean. Please try again.`),
          on: { ENDSPEECH: "ask" },
        },
        youthere: {
          entry: say(`Are you there? What time shall the meeting be?`), 
          on: { ENDSPEECH: "ask" },
        },
        notsure: {
          entry: send((context) => ({
            type: "SPEAK",
            value: `Did you say ${context.recResult[0].utterance.toLowerCase().replace(/\.$/g, "")}?`,
          })),
          on: { ENDSPEECH: "ask" }, 
        },
        restart: {
          entry: say(`Seems like you're not there. Bye, see you when you're back!`),
          on: { ENDSPEECH: "#init" },
        },
      },
    },
    confirmation_whole_day: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: ".help",
            cond: (context) => getNLUResult(context) === "help",
            actions: assign({timeout_count: 0}),
          },
          {
            target: "endline",
            cond: (context) => getNLUResult(context) === "affirm",
            actions: assign({timeout_count: 0}),
          },
          {
            target: "welcome",
            cond: (context) => getNLUResult(context) === "reject",
            actions: assign({timeout_count: 0}),
          },
          {
            target: ".nomatch",
            actions: assign({timeout_count: 0}),
          },
        ],
        TIMEOUT: [
          {
            target: ".youthere", 
            cond: (context) => context.timeout_count < 3,
            actions: assign({timeout_count: (context) => augmentTimeout(context) }),
          },
          {
            target: ".restart",
            cond: (context) => context.timeout_count >= 3,
          },
        ],
      },
      states: {
        prompt: {
          entry: send((context) => ({
            type: "SPEAK",
            value: `Okay, I scheduled ${context.title} on ${context.day}. Is that correct? If not, we will try scheduling your meeting once again.`,
            })),
          on: { ENDSPEECH: "ask" },
        },
        help: {
          entry: say(`I will say it once again, hopefully this helps.`),
          on: { ENDSPEECH: "prompt"},
        },
       ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          entry: say(`Sorry, I didn't get what you mean. Please try again.`),
          on: { ENDSPEECH: "ask" },
        },
        youthere: {
          entry: say(`Are you there? Did I say everything right?`), 
          on: { ENDSPEECH: "ask" },
        },
        restart: {
          entry: say(`Seems like you're not there. Bye, see you when you're back!`),
          on: { ENDSPEECH: "#init" },
        },
      },
    },
    confirmation_time: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: ".help",
            cond: (context) => getNLUResult(context) === "help",
            actions: assign({timeout_count: 0}),
          },
          {
            target: "endline",
            cond: (context) => getNLUResult(context) === "affirm",
            actions: assign({timeout_count: 0}),
          },
          {
            target: "welcome",
            cond: (context) => getNLUResult(context) === "reject",
            actions: assign({timeout_count: 0}),
          },
          {
            target: ".nomatch",
            actions: assign({timeout_count: 0}),
          },
        ],
        TIMEOUT: [
          {
            target: ".youthere", 
            cond: (context) => context.timeout_count < 3,
            actions: assign({timeout_count: (context) => augmentTimeout(context) }),
          },
          {
            target: ".restart",
            cond: (context) => context.timeout_count >= 3,
          },
        ],
      },
      states: {
        prompt: {
          entry: send((context) => ({
            type: "SPEAK",
            value: `Okay, I scheduled ${context.title} on ${context.day} at ${context.time}. Is that correct? If not, we will try scheduling your meeting once again.`,
            })),
          on: { ENDSPEECH: "ask" },
        },
        help: {
          entry: say(`I will say it once again, hopefully this helps.`),
          on: { ENDSPEECH: "prompt"},
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          entry: say(`Sorry, I didn't get what you mean. Please try again.`),
          on: { ENDSPEECH: "ask" },
        },
        youthere: {
          entry: say(`Are you there? Did I say everything right??`), 
          on: { ENDSPEECH: "ask" },
        },
        restart: {
          entry: say(`Seems like you're not there. Bye, see you when you're back!`),
          on: { ENDSPEECH: "#init" },
        },
      },
    },
    endline: {
      entry: send((context) => ({
        type: "SPEAK",
        value: `Your meeting has been created!`,
        })),
    },
    endline2: {
      entry: send((context) => ({
        type: "SPEAK",
        value: `Goodbye then!`,
        })),
    },
  },
};

const kbRequest = (text: string) =>
  fetch(
    new Request(
      `https://cors.eu.org/https://api.duckduckgo.com/?q=${text}&format=json&skip_disambig=1`
    )
  ).then((data) => data.json());
