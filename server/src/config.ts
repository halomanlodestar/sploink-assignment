/** @format */

export interface Config {
  store: {
    maxEventsPerSession: number;
  };
  loop: {
    bufferSize: number;
    minFill: number;
    scoreThreshold: number;
    ngramSizes: number[];
  };
  drift: {
    windowSize: number;
    minEvents: number;
    similarityThreshold: number;
    maxKeywordsPerWindow: number;
  };
  failure: {
    emaAlpha: number;
    emaThreshold: number;
    coldStartMin: number;
    retryWindow: number;
    retryMinFails: number;
    streakThreshold: number;
  };
  detection: {
    debounceMs: number;
    maxWaitMs: number;
  };
}

export const CONFIG: Config = {
  store: {
    maxEventsPerSession: 1000,
  },
  loop: {
    bufferSize: 30,
    minFill: 10,
    scoreThreshold: 0.25,
    ngramSizes: [2, 3, 4],
  },
  drift: {
    windowSize: 15,
    minEvents: 25,
    similarityThreshold: 0.6,
    maxKeywordsPerWindow: 20,
  },
  failure: {
    emaAlpha: 0.3,
    emaThreshold: 0.4,
    coldStartMin: 5,
    retryWindow: 30,
    retryMinFails: 2,
    streakThreshold: 3,
  },
  detection: {
    debounceMs: 50,
    maxWaitMs: 200,
  },
};
