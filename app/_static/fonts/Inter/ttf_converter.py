#!/usr/bin/python
import os, fontforge

path = os.getcwd()
fileList = os.listdir(path)
extensions = ['.eot', '.otf', '.woff', '.woff2']

for item in fileList:
    if item[-4::] == '.ttf':
        font = fontforge.open(item)
        filename = item[0:-4:]
        for extension in extensions:
            font.generate(filename + extension)
