class PriorityQueue<T> {
    private heap: T[] = [];

    enqueue(element: T): void {
        this.heap.push(element);
        this.bubbleUp();
    }

    dequeue(): T | undefined {
        const top = this.heap[0];
        const last = this.heap.pop();

        if (this.heap.length > 0) {
            this.heap[0] = last!;
            this.bubbleDown();
        }

        return top;
    }

    isEmpty(): boolean {
        return this.heap.length === 0;
    }

    private bubbleUp(): void {
        let index = this.heap.length - 1;

        while (index > 0) {
            const current = this.heap[index];
            const parentIndex = Math.floor((index - 1) / 2);
            const parent = this.heap[parentIndex];

            if (current < parent) {
                this.swap(index, parentIndex);
                index = parentIndex;
            } else {
                break;
            }
        }
    }

    private bubbleDown(): void {
        let index = 0;

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const current = this.heap[index];
            const leftChildIndex = 2 * index + 1;
            const rightChildIndex = 2 * index + 2;
            const leftChild = this.heap[leftChildIndex];
            const rightChild = this.heap[rightChildIndex];
            let swap = null;

            if (leftChildIndex < this.heap.length && current > leftChild) {
                swap = leftChildIndex;
            }

            if (rightChildIndex < this.heap.length && (!swap || rightChild < leftChild)) {
                swap = rightChildIndex;
            }

            if (swap !== null) {
                this.swap(index, swap);
                index = swap;
            } else {
                break;
            }
        }
    }

    private swap(i: number, j: number): void {
        const temp = this.heap[i];
        this.heap[i] = this.heap[j];
        this.heap[j] = temp;
    }
}

export default PriorityQueue;
