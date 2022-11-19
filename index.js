const fs = require('fs');
const path = require('path');

const ejs = require('ejs');
const jsyaml = require('js-yaml');

const snarkdown = require('snarkdown');
const minify = require('html-minifier').minify;

const postcss = require('postcss');
const cssnano = require('cssnano');
const tailwindcss = require('tailwindcss');

const getFilesPathRecursivelyFromDirectory = directoryPath => {
    return fs.readdirSync(directoryPath, { withFileTypes: true }).reduce((files, dirent) => {
        const normalizedPath = path.join(directoryPath, dirent.name);

        if(dirent.isFile())
            return files.concat(normalizedPath);

        return files.concat(getFilesPathRecursivelyFromDirectory(normalizedPath));
    }, []);
};

const getAttributesFromString = string => {
    return jsyaml.load(string.match(/---(.*?)---/s)?.at(1) || '');
};

const getFlatMapFromSite = () => {
    return getFilesPathRecursivelyFromDirectory('site').map(filePath => {
        let fileContent = fs.readFileSync(filePath);
        let item = {};

        item.filePath = filePath.replace('site/', '').replace(/\.[^.]+$/, (extension) => {
            if(extension == '.md' || extension == '.yml') {
                fileContent = fileContent.toString();

                Object.assign(item, getAttributesFromString(fileContent));
            }

            if(extension == '.md') {
                item.fileContent = snarkdown(fileContent.replace(/---(.*?)---/s, ''));

                return '.html';
            }

            if(extension == '.yml')
                return '';

            item.fileContent = fileContent;

            return extension;
        });

        return item;
    });
};

const getNestedMapFromSite = () => {
    return getFlatMapFromSite().reduce((map, item) => {
        const levels = item.filePath.split('/');
        let currentMap = map;

        for(let i = 0; i < levels.length; i++) {
            if(i === levels.length - 1)
                currentMap[levels[i]] = item;
            else
                currentMap[levels[i]] = currentMap[levels[i]] || {};

            currentMap = currentMap[levels[i]];
        }

        return map;
    }, {});
};

const mkdirAndWriteFile = (filePath, fileContent) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, fileContent);
};

fs.rm('build', { recursive: true }, () => {
    let hrStart = process.hrtime();
    const site = getNestedMapFromSite();

    getFlatMapFromSite().filter(item => item.fileContent).forEach(item => {
        let { layout, fileContent } = item;

        while(layout) {
            const layoutContent = fs.readFileSync(`src/layouts/${layout}.html`, 'utf8');
            
            layout = getAttributesFromString(layoutContent)?.layout;
            fileContent = ejs.render(layoutContent, { fileContent, site, item }, {
                includer: file => {
                    return { filename: `src/includes/${file}.html` };
                }
            });

            if(!layout)
                fileContent = minify(fileContent, {
                    collapseWhitespace: true,
                    removeComments: true,
                    minifyJS: true,
                });
        }

        mkdirAndWriteFile(`build/${item.filePath}`, fileContent);
    });

    const cssContent = fs.readFileSync('src/css/main.css', 'utf8')

    postcss([tailwindcss, cssnano]).process(cssContent, { from: undefined }).then(({ css }) => {
        mkdirAndWriteFile('build/css/main.css', css);
    });

    console.log(`Build completed in ${(process.hrtime(hrStart)[1] / 1e6).toFixed(2)}ms`);
});