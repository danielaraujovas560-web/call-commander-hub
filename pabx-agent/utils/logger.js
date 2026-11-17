"use strict";

const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

let baseLevel = process.env.LOG_LEVEL || "info";
if (!(baseLevel in LEVELS)) baseLevel = "info";

let temporaryLevel = null;
let expiresAt = null;
let timer = null;

function currentLevel() {
  return temporaryLevel ?? baseLevel;
}

function status() {
  return {
    level: currentLevel(),
    defaultLevel: baseLevel,
    temporary: temporaryLevel !== null,
    expiresAt,
  };
}

function setLevel(level, seconds = 0) {
  level = String(level).toLowerCase();

  if (!(level in LEVELS)) {
    throw new Error("Nível inválido");
  }

  seconds = Number(seconds);

  if (
    !Number.isInteger(seconds) ||
    seconds < 0 ||
    seconds > 86400
  ) {
    throw new Error("Duração inválida (0 a 86400 segundos)");
  }

  if (timer) clearTimeout(timer);

  timer = null;
  temporaryLevel = null;
  expiresAt = null;

  if (seconds > 0) {
    temporaryLevel = level;
    expiresAt = new Date(
      Date.now() + seconds * 1000
    ).toISOString();

    timer = setTimeout(() => {
      temporaryLevel = null;
      expiresAt = null;
      timer = null;
    }, seconds * 1000);

    timer.unref();
  } else {
    baseLevel = level;
  }

  return status();
}

function write(level, ...args) {
  if (LEVELS[level] > LEVELS[currentLevel()]) return;

  const output =
    level === "error" ? console.error :
    level === "warn" ? console.warn :
    console.log;

  output(...args);
}

module.exports = {
  error: (...args) => write("error", ...args),
  warn: (...args) => write("warn", ...args),
  info: (...args) => write("info", ...args),
  debug: (...args) => write("debug", ...args),
  setLevel,
  status,
};
