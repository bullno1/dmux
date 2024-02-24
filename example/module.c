int
some_function(int arg) {
    int result = 0;
    for (int i = 0; i < arg; ++i) {
        for (int j = 0; j < arg; ++j) {
            result += j;
        }
    }

    return result;
}
