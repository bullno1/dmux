export type Source<T> = () => Promise<T>;

export type Sink<T> = (value: T) => void;

export function pair<T>(): [Source<T>, Sink<T>] {
  const queue = new Queue<T>();
  return [queue.pop.bind(queue), queue.push.bind(queue)];
}

export function map<T, U>(
  originalSource: Source<T>,
  fn: (value: T) => U,
): Source<U> {
  const [source, sink] = pair<U>();

  (async () => {
    while (true) {
      sink(fn(await originalSource()));
    }
  });

  return source;
}

type Waiter<T> = (value: T) => void;

class Queue<T> {
  private queue: T[] = [];
  private waiters: Waiter<T>[] = [];

  push(value: T): void {
    const waiter = this.waiters.shift();
    if (waiter !== undefined) {
      waiter(value);
    } else {
      this.queue.push(value);
    }
  }

  pop(): Promise<T> {
    if (this.queue.length > 0) {
      return Promise.resolve(this.queue.shift()!);
    } else {
      return new Promise<T>((resolve) => this.waiters.push(resolve));
    }
  }
}
