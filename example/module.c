#include "module.h"

int
some_function(input_t input) {
    int result = 0;
    for (int i = 0; i < input.arg; ++i) {
        for (int j = 0; j < input.arg; ++j) {
            result += input.inc;
        }
    }

    return result;
}
