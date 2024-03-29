// reference: https://ourcodeworld.com/articles/read/927/how-to-create-a-msi-installer-in-windows-for-an-electron-framework-application
// to run: node build_installer.js
const { MSICreator } = require('electron-wix-msi');
const path = require('path');
const fs = require("fs");
const child_process = require('child_process');
const archiver = require('archiver');


let packages=JSON.parse(fs.readFileSync("package.json"));
let versions=packages.version.split(".");
let last=parseInt(versions[versions.length-1]);
versions.pop();
versions.push(last+1);
versions=versions.join(".");
packages.version=versions;

// turn off debug

function setConstant(fn,constant,value) {
    let source=fs.readFileSync(fn,"utf-8");
    let idx=source.indexOf(constant);
    if (idx!=-1) {
        idx+=constant.length;
        while(idx<source.length && (source[idx]==" " || source[idx]=="\n")) idx++;
        if (source[idx]=="=") {
            idx++;
            while(idx<source.length && (source[idx]==" " || source[idx]=="\n")) idx++;
            let start=idx;
            while(idx<source.length && (source[idx]!=";" && source[idx]!="\n")) idx++;
            fs.writeFileSync(fn,source.substring(0,start)+value+source.substring(idx));
        }
    } 
}

setConstant(packages.main,"VERSION",'"'+versions+'"');
setConstant(packages.main,"DEBUG","false");



console.log("Creating version "+versions);

const APP_NAME = packages.productName||packages.name;
const APP_DIR = path.resolve(__dirname, './' + APP_NAME + '-win32-x64');
const OUT_DIR = path.resolve(__dirname, './windows_installer');
const APP_ICON = path.resolve(__dirname, './icon.ico');
const REPACKAGE = true;
const BUILDMSI = true;
const BUILDZIP = true;

if (REPACKAGE) {
    // clear things up
    if (fs.existsSync(APP_DIR)) fs.rmSync(APP_DIR, { recursive: true, force: true });
    if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true, force: true });
    // remove .zip file
    let files=fs.readdirSync(".");
    for(let i=0; i<files.length; i++) {
        if (files[i].startsWith(APP_NAME) && files[i].endsWith(".zip")) {
            fs.rmSync(files[i]);
        }
    }

    console.log("Former builds were deleted");
    child_process.execSync("electron-packager . --platform=win32 --arch=x64 --icon=" + APP_ICON + " " + APP_NAME);
    console.log("Stuff is packaged");
    // clean up packaged stuff to make installer much smaller
    const APP_NODE_MODULES = path.resolve(APP_DIR, './resources/app');
    child_process.execSync("modclean -n default:safe -r -p " + APP_NODE_MODULES);
    child_process.execSync("modclean -n default:caution -r -p " + APP_NODE_MODULES);


    console.log("Stuff is cleaned for smaller package");
}

// Instantiate the MSICreator
const msiCreator = new MSICreator({
    appDirectory: APP_DIR,
    outputDirectory: OUT_DIR,
    appIconPath: APP_ICON,

    // Configure metadata
    description: APP_NAME,
    exe: APP_NAME,
    name: APP_NAME,
    manufacturer: 'ICHEC Brussels Management School, Donatien Grolaux',
    version: versions,

    // Configure installer User Interface
    ui: {
        chooseDirectory: true
    },
});

if (BUILDZIP) {
    let output = fs.createWriteStream(APP_NAME+"-"+versions+".zip");
    var archive = archiver('zip');
    
    output.on('close', function () {
        console.log(archive.pointer() + ' total bytes');
        console.log('archiver has been finalized and the output file descriptor has closed.');
    });
    
    archive.on('error', function(err){
        throw err;
    });
    
    archive.pipe(output);
    
    // append files from a sub-directory, putting its contents at the root of archive
    archive.directory(APP_DIR, false);
    
    archive.finalize();
}

if (BUILDMSI) {
    // 4. Create a .wxs template file
    msiCreator.create().then(function () {
        // Step 5: Compile the template to a .msi file
        msiCreator.compile().then(function () {
            // Step 6: rename the .msi to include the version number.
            let files=fs.readdirSync(OUT_DIR);
            for(let i=0; i<files.length; i++) {
                if (files[i].endsWith(".msi")) {
                    fs.renameSync(path.join(OUT_DIR,files[i]),path.join(OUT_DIR,files[i].substring(0,files[i].length-4)+"-"+versions+".msi"));
                }
            }
            console.log("MSI is ready");
            done();
        });
    });
} else {
    done();
}

function done() {
    // only write back the new version number after finishing, to avoid incrementing on cancelled builds
    fs.writeFileSync("package.json",JSON.stringify(packages,null,4));
}