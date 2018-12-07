import React from 'react';

import { createLRU } from './LRU';

const Pending = 0;
const Resolved = 1;
const Rejected = 2;

const currentOwner =
  React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner;

function readContext(Context, observedBits) {
  const dispatcher = currentOwner.currentDispatcher;
  if (dispatcher === null) {
    throw new Error(
      'react-cache: read and preload may only be called from within a ' +
        "component's render. They are not supported in event handlers or " +
        'lifecycle methods.'
    );
  }
  return dispatcher.readContext(Context, observedBits);
}

function identityHashFn(input) {
  return input;
}

const CACHE_LIMIT = 500;
const lru = createLRU(CACHE_LIMIT);

const entries = new Map();

const CacheContext = React.createContext(null);

function accessResult(resource, fetch, input, key) {
  let entriesForResource = entries.get(resource);
  if (entriesForResource === undefined) {
    entriesForResource = new Map();
    entries.set(resource, entriesForResource);
  }
  let entry = entriesForResource.get(key);
  if (entry === undefined) {
    const thenable = fetch(input);
    thenable.then(
      value => {
        if (newResult.status === Pending) {
          const resolvedResult = newResult;
          resolvedResult.status = Resolved;
          resolvedResult.value = value;
        }
      },
      error => {
        if (newResult.status === Pending) {
          const rejectedResult = newResult;
          rejectedResult.status = Rejected;
          rejectedResult.value = error;
        }
      }
    );
    const newResult: PendingResult = {
      status: Pending,
      value: thenable
    };
    const newEntry = lru.add(newResult, deleteEntry.bind(null, resource, key));
    entriesForResource.set(key, newEntry);
    return newResult;
  } else {
    return (lru.access(entry): any);
  }
}

function deleteEntry(resource, key) {
  const entriesForResource = entries.get(resource);
  if (entriesForResource !== undefined) {
    entriesForResource.delete(key);
    if (entriesForResource.size === 0) {
      entries.delete(resource);
    }
  }
}

export function unstable_createResource(fetch, maybeHashInput): Resource {
  const hashInput =
    maybeHashInput !== undefined ? maybeHashInput : identityHashFn;

  const resource = {
    read(input) {
      // react-cache currently doesn't rely on context, but it may in the
      // future, so we read anyway to prevent access outside of render.
      readContext(CacheContext);
      const key = hashInput(input);
      const result = accessResult(resource, fetch, input, key);
      switch (result.status) {
        case Pending: {
          const suspender = result.value;
          throw suspender;
        }
        case Resolved: {
          const value = result.value;
          return value;
        }
        case Rejected: {
          const error = result.value;
          throw error;
        }
        default:
          // Should be unreachable
          return (undefined: any);
      }
    },

    preload(input) {
      // react-cache currently doesn't rely on context, but it may in the
      // future, so we read anyway to prevent access outside of render.
      readContext(CacheContext);
      const key = hashInput(input);
      accessResult(resource, fetch, input, key);
    }
  };
  return resource;
}

export function unstable_setGlobalCacheLimit(limit) {
  lru.setLimit(limit);
}
