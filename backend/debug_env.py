with open(".env", "r") as f:
    lines = f.readlines()
    for i, line in enumerate(lines):
        print(f"L{i+1}: {repr(line)}")
