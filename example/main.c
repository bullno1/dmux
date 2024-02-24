#include <stdio.h>
#include <stdlib.h>
#include "module.h"

int
main(int argc, const char* argv[]) {
    int value = 4;  // Random default
    if (argc >= 2) {
        value = strtol(argv[1], NULL, 10);
    }

    printf("%d\n", some_function(value));

    return 0;
}
