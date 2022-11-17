const fs = require('fs');
const path = require('path');

const ejs = require('ejs');
const jsyaml = require('js-yaml');

const snarkdown = require('snarkdown');
const minify = require('html-minifier').minify;

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

        return {
            filePath: filePath.replace('site/', '').replace('.md', '.html'),
            ...(filePath.endsWith('.md') ? {
                fileContent: snarkdown(fileContent.toString().replace(/---(.*?)---/s, '')),
                ...getAttributesFromString(fileContent.toString())
            } : { fileContent })
        }
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
                    minifyCSS: true
                });
        }

        fs.mkdirSync(path.dirname(`build/${item.filePath}`), { recursive: true });
        fs.writeFileSync(`build/${item.filePath}`, fileContent);
    });

    console.log(`Build completed in ${process.hrtime(hrStart)[1] / 1000000}ms`);
});