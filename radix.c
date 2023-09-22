/*
Translate this:
  for (let j = 0; j < COUNT; j++) {
                    bins[(arr[j] >> shift) & BINSM1]++;
                }

                // Accumulating phase
                for (let j = 1; j < BINS; j++) {
                    bins[j] += bins[j - 1];
                }

                // Sorting phase
                for (let j = COUNT - 1; j >= 0; j--) {
                    const binIdx = (arr[j] >> shift) & BINSM1;
                    sorted[--bins[binIdx]] = arr[j];
                    sortedIds[bins[binIdx]] = particleIds[j];
                }

                arr.set(sorted);
                particleIds.set(sortedIds);
To emiscripten
*/

#include <emscripten.h>
#include <stdlib.h>

void radix(unsigned int *arr, unsigned int *particleIds, unsigned int *sorted, unsigned int *sortedIds, unsigned int COUNT, unsigned int BINS, unsigned int BINSM1, unsigned int shift) {
  unsigned int bins[256];
  for (int j = 0; j < COUNT; j++) {
    bins[(arr[j] >> shift) & BINSM1]++;
  }

  // Accumulating phase
  for (int j = 1; j < BINS; j++) {
    bins[j] += bins[j - 1];
  }

  // Sorting phase
  for (int j = COUNT - 1; j >= 0; j--) {
    const unsigned int binIdx = (arr[j] >> shift) & BINSM1;
    sorted[--bins[binIdx]] = arr[j];
    sortedIds[bins[binIdx]] = particleIds[j];
  }

}
