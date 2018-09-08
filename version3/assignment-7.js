"use strict";
// General variables
var gl;
var canvas;

var printDay;

// Matrices
var mvMatrix; // Modelview matrix
var nMatrix; // Normal matrix
var projMatrix; // Projection matrix
var commonMVMatrix; // Common modelview matrix

var stack = []; // Matrix stack

// Attributes
var a_positionLoc; // Vertex position
var a_normalLoc; // Vertex normal
var a_textureCoordLoc; // Texture coordinates

// Uniforms
var u_colorLoc;
var u_lightColorLoc; // Light color location
var u_mvMatrixLoc; // Modelview matrix location
var u_nMatrixLoc; // Normal matrix location
var u_projMatrixLoc; // Projection matrix location
var u_textureSamplerLoc; // Texture sampler location
var u_useLightingLoc;
var u_useTexturingLoc;

// Light attributes
var lightPosition = vec4(0.0, 0.707, 1.0, 0.0 ); // Light position (w-component: 0->point, 1->vector)
    // Lighting components (can set as vec4's to specify color, or generalize as scalars)
var lightAmbient = 0.2 // Ambient component
var lightDiffuse = 1.0 // Diffuse component
var lightSpecular = 1.0 // Specular component
    // Light color
var lightColorR = 1.0;
var lightColorG = 1.0;
var lightColorB = 1.0;
var lightColor = vec4(lightColorR, lightColorG, lightColorB, 1.0);

// Other variables
var materialShininess = 6.0; // Object shininess


// Last time that this function was called
var g_last = Date.now();
var elapsed = 0; // Time elapsed since start
var mspf = 1000/30.0;  // ms per frame

// Scale factors
var rSunMult = 45; // Keep sun's size manageable
var rPlanetMult = 2000; // Scale planet sizes to be more visible
var globalScale; // Global scaling for the entire orrery

// Surface radii (km)
var rSun = 696000;
var rMercury = 2440;
var rVenus = 6052;
var rEarth = 6371;
var rMoon = 1737;

// Orbital radii (km)
var orMercury = 57909050;
var orVenus = 108208000;
var orEarth = 149598261;
var orMoon = 384399;

// Orbital periods (Earth days)
var pMercury = 88;
var pVenus = 225;
var pEarth = 365;
var pMoon = 27;

// Time
var currentDay;
var daysPerFrame;

// Textures
var sunTexture;
var mercuryTexture;
var venusTexture;
var earthTexture;
var moonTexture;
var orbitTexture;

// Arrays
var circleVertexPositionData = []; // For orbits
var sphereVertexPositionData = []; // For planets mesh vertices
var sphereVertexIndexData = []; // For planets vertex indices
var sphereVertexNormalData = []; // For planets normals
var textureCoordData = []; // For sphere textures

// Buffers
var circleVertexPositionBuffer;
var sphereVertexPositionBuffer;
var sphereVertexIndexBuffer;
var sphereVertexNormalBuffer;
var sphereVertexTextureCoordBuffer;

// Trackball
var m_inc;
var m_curquat;
var m_mousex = 1;
var m_mousey = 1;
var trackballMove = false;

window.onload = function init()
{
    // Initialize variables and functions
    canvas = document.getElementById( "gl-canvas" );
    printDay = document.getElementById("printDay");

        // Change days passed per frame
    document.getElementById("incDPF").onclick = function() { daysPerFrame *= 2; }
    document.getElementById("decDPF").onclick = function() { daysPerFrame /= 2; }

        // Adjust light color components
    document.getElementById("red").onchange = function(event) {
        lightColorR = event.target.value;
    };
    document.getElementById("green").onchange = function(event) {
        lightColorG = event.target.value;
    };
    document.getElementById("blue").onchange = function(event) {
        lightColorB = event.target.value;
    };

    gl = WebGLUtils.setupWebGL( canvas );
    if ( !gl ) { alert( "WebGL isn't available" ); }

    //
    //  Configure WebGL
    //
    gl.viewport( 0, 0, canvas.width, canvas.height );
    gl.clearColor( 0.0, 0.0, 0.0, 1.0 );

    gl.enable(gl.DEPTH_TEST);

    // For trackball
    m_curquat = trackball(0, 0, 0, 0);

    currentDay = 0;
    daysPerFrame = 1.0;

    // Scale the whole orrery to fit on the canvas
    globalScale = 1.0 / ( orEarth + orMoon + ( rEarth + 2 * rMoon ) * rPlanetMult );

    setupCircle(); // Setup orbits

    setupSphere(); // Setup planets

    initTexture(); // Initialize textures

    //  Load shaders and initialize attribute buffers
    var program = initShaders( gl, "vertex-shader", "fragment-shader" );
    gl.useProgram( program );

    //
    // Load the data into the GPU
    //
        // Orbit
    circleVertexPositionBuffer = gl.createBuffer();
    gl.bindBuffer( gl.ARRAY_BUFFER, circleVertexPositionBuffer );
    gl.bufferData( gl.ARRAY_BUFFER, flatten(circleVertexPositionData), gl.STATIC_DRAW );
        // Planet vertices
    sphereVertexPositionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sphereVertexPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sphereVertexPositionData), gl.STATIC_DRAW);
        // Planet indices
    sphereVertexIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphereVertexIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(sphereVertexIndexData), gl.STATIC_DRAW);
        // Planet normals
    sphereVertexNormalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sphereVertexNormalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sphereVertexNormalData), gl.STATIC_DRAW);
        // Planet textures
    sphereVertexTextureCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sphereVertexTextureCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordData), gl.STATIC_DRAW);


    // Associate out shader variables with our data buffer
        // Collect these uniform locations to set multiple times
    a_positionLoc = gl.getAttribLocation( program, "a_vPosition" );
    a_normalLoc = gl.getAttribLocation( program, "a_vNormal" );
    a_textureCoordLoc = gl.getAttribLocation(program, "a_textureCoord");

    u_colorLoc = gl.getUniformLocation(program, "u_color");
    gl.uniform4fv(u_colorLoc, vec4(1.0, 1.0, 1.0, 1.0));
    u_lightColorLoc = gl.getUniformLocation(program, "u_lightColor");
    u_mvMatrixLoc = gl.getUniformLocation( program, "u_mvMatrix" );
    u_nMatrixLoc = gl.getUniformLocation( program, "u_nMatrix" );
    u_textureSamplerLoc = gl.getUniformLocation(program, "u_textureSampler");
    u_useLightingLoc = gl.getUniformLocation(program, "u_useLighting");
    gl.uniform1i(u_useLightingLoc, 1);
    u_useTexturingLoc = gl.getUniformLocation(program, "u_useTexturing");
    gl.uniform1i(u_useTexturingLoc, 1);
        // Create location matrix and set
    u_projMatrixLoc = gl.getUniformLocation( program, "u_projMatrix" );
    projMatrix = mult(ortho(-2.0, 2.0, -1.0, 1.0, -1.0, 1.0), rotateX(30));
    gl.uniformMatrix4fv(u_projMatrixLoc, false, flatten(projMatrix) );
        // Set these uniforms once
    gl.uniform1f( gl.getUniformLocation(program, "u_ambient"),lightAmbient );
    gl.uniform1f( gl.getUniformLocation(program, "u_diffuse"),lightDiffuse );
    gl.uniform1f( gl.getUniformLocation(program, "u_specular"),lightSpecular );
    gl.uniform4fv( gl.getUniformLocation(program, "u_lightPosition"),flatten(lightPosition) );
    gl.uniform4fv( u_lightColorLoc, flatten(lightColor) );
    gl.uniform1f( gl.getUniformLocation(program, "u_shininess"),materialShininess );


    // For trackball
    canvas.addEventListener("mousedown", function(event){
        m_mousex = event.clientX - event.target.getBoundingClientRect().left;
        m_mousey = -event.clientY + event.target.getBoundingClientRect().top;
        trackballMove = true;
    });

    // For trackball
    canvas.addEventListener("mouseup", function(event){
        trackballMove = false;
    });

    // For trackball
    canvas.addEventListener("mousemove", function(event){
      if (trackballMove) {
        var x = event.clientX - event.target.getBoundingClientRect().left;
        var y = event.clientY - event.target.getBoundingClientRect().top;
        mouseMotion(x, -y);
      }
    } );

    render(); // Start render process
}


// Texture handler
function handleLoadedTexture(texture) {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, texture.image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
    gl.generateMipmap(gl.TEXTURE_2D);

    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(u_textureSamplerLoc, 0);
}

// Texture initializer
function initTexture() {
    sunTexture = gl.createTexture();
    sunTexture.image = new Image();
    sunTexture.image.onload = function () {
        handleLoadedTexture(sunTexture)
    }
    sunTexture.image.src = "sun.jpg";

    mercuryTexture = gl.createTexture();
    mercuryTexture.image = new Image();
    mercuryTexture.image.onload = function () {
        handleLoadedTexture(mercuryTexture)
    }
    mercuryTexture.image.src = "mercury.jpg";

    venusTexture = gl.createTexture();
    venusTexture.image = new Image();
    venusTexture.image.onload = function () {
        handleLoadedTexture(venusTexture)
    }
    venusTexture.image.src = "venus.jpg";

    earthTexture = gl.createTexture();
    earthTexture.image = new Image();
    earthTexture.image.onload = function () {
        handleLoadedTexture(earthTexture)
    }
    earthTexture.image.src = "earth.jpg";

    moonTexture = gl.createTexture();
    moonTexture.image = new Image();
    moonTexture.image.onload = function () {
        handleLoadedTexture(moonTexture)
    }
    moonTexture.image.src = "moon.jpg";

    orbitTexture = gl.createTexture();
    orbitTexture.image = new Image();
    orbitTexture.image.onload = function () {
        handleLoadedTexture(orbitTexture)
    }
    orbitTexture.image.src = "white.jpg";
}


function setupCircle() {
    var increment = 0.1;
    for (var theta=0.0; theta < Math.PI*2; theta+=increment) {
        circleVertexPositionData.push(vec3(Math.cos(theta+increment), 0.0, Math.sin(theta+increment)));
    }
}

function setupSphere() {
    var latitudeBands = 50;
    var longitudeBands = 50;
    var radius = 1.0;

    // compute sampled vertex positions
    for (var latNumber=0; latNumber <= latitudeBands; latNumber++) {
        var theta = latNumber * Math.PI / latitudeBands;
        var sinTheta = Math.sin(theta);
        var cosTheta = Math.cos(theta);

        for (var longNumber=0; longNumber <= longitudeBands; longNumber++) {
            var phi = longNumber * 2 * Math.PI / longitudeBands;
            var sinPhi = Math.sin(phi);
            var cosPhi = Math.cos(phi);

            var x = cosPhi * sinTheta;
            var y = cosTheta;
            var z = sinPhi * sinTheta;
            var u = 1 - (longNumber / longitudeBands);
            var v = 1 - (latNumber / latitudeBands);

            textureCoordData.push(u);
            textureCoordData.push(v);

            sphereVertexPositionData.push(radius * x);
            sphereVertexPositionData.push(radius * y);
            sphereVertexPositionData.push(radius * z);

            // create vertex normals
            sphereVertexNormalData.push(x);
            sphereVertexNormalData.push(y);
            sphereVertexNormalData.push(z);
        }
    }

    // create the actual mesh, each quad is represented by two triangles
    for (var latNumber=0; latNumber < latitudeBands; latNumber++) {
        for (var longNumber=0; longNumber < longitudeBands; longNumber++) {
            var first = (latNumber * (longitudeBands + 1)) + longNumber;
            var second = first + longitudeBands + 1;
            // the three vertices of the 1st triangle
            sphereVertexIndexData.push(first);
            sphereVertexIndexData.push(second);
            sphereVertexIndexData.push(first + 1);
            // the three vertices of the 2nd triangle
            sphereVertexIndexData.push(second);
            sphereVertexIndexData.push(second + 1);
            sphereVertexIndexData.push(first + 1);
        }
    }
}

function drawCircle(color, size) {
    var topm = stack[stack.length-1]; // get the matrix at the top of stack
    mvMatrix = mult(topm, scalem(size, size, size));
    mvMatrix = mult(commonMVMatrix, mvMatrix);
    gl.uniformMatrix4fv(u_mvMatrixLoc, false, flatten(mvMatrix) );

    nMatrix = normalMatrix(mvMatrix, true); // return 3 by 3 normal matrix
    gl.uniformMatrix3fv(u_nMatrixLoc, false, flatten(nMatrix));

    gl.uniform1i(u_useLightingLoc, false);
    gl.uniform1i(u_useTexturingLoc, false);
    gl.uniform4fv(u_colorLoc, color);

    gl.enableVertexAttribArray( a_positionLoc );
    gl.bindBuffer(gl.ARRAY_BUFFER, circleVertexPositionBuffer);
    gl.vertexAttribPointer( a_positionLoc, 3, gl.FLOAT, false, 0, 0 );
    gl.drawArrays( gl.LINE_LOOP, 0, circleVertexPositionData.length );
}

function drawSphere(texture, size) {
    var topm = stack[stack.length-1]; // get the matrix at the top of stack
    mvMatrix = mult(topm, scalem(size, size, size));
    mvMatrix = mult(commonMVMatrix, mvMatrix);
    gl.uniformMatrix4fv(u_mvMatrixLoc, false, flatten(mvMatrix) );

    nMatrix = normalMatrix(mvMatrix, true); // return 3 by 3 normal matrix
    gl.uniformMatrix3fv(u_nMatrixLoc, false, flatten(nMatrix));

    gl.uniform1i(u_useLightingLoc, true);
    gl.uniform1i(u_useTexturingLoc, true);

    gl.enableVertexAttribArray( a_textureCoordLoc );
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(u_textureSamplerLoc, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, sphereVertexTextureCoordBuffer);
    gl.vertexAttribPointer(a_textureCoordLoc, 2, gl.FLOAT, false, 0, 0);

    gl.enableVertexAttribArray( a_normalLoc );
    gl.bindBuffer(gl.ARRAY_BUFFER, sphereVertexNormalBuffer);
    gl.vertexAttribPointer(a_normalLoc, 3, gl.FLOAT, false, 0, 0);

    gl.enableVertexAttribArray( a_positionLoc );
    gl.bindBuffer(gl.ARRAY_BUFFER, sphereVertexPositionBuffer);
    gl.vertexAttribPointer(a_positionLoc, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphereVertexIndexBuffer);
    gl.drawElements(gl.TRIANGLES, sphereVertexIndexData.length, gl.UNSIGNED_SHORT, 0);
}

function drawOrbits() {
    var col = vec4( 1.0, 1.0, 0.0, 1.0 );
    var angleOffset = currentDay * 360.0;

    // Mercury
    stack.push(mat4());
    drawCircle(col, orMercury);
    stack.pop();

    // Venus
    stack.push(mat4());
    drawCircle(col, orVenus );
    stack.pop();

    // Earth
    stack.push(mat4());
    drawCircle(col, orEarth);
    stack.pop();

    // Moon
    stack.push(mult(rotateY(angleOffset/pEarth), translate(orEarth, 0.0, 0.0)));
    drawCircle(col, orMoon * 50);
    stack.pop();
}

function drawBodies() {
    var size;
    var angleOffset = currentDay * 360.0;  // days * degrees

    // Sun
    size = rSun * rSunMult;
    stack.push(rotateY(currentDay * 0.7));
    drawSphere( sunTexture, size );
    stack.pop();

    // Mercury
    size = rMercury * rPlanetMult;
    stack.push(mult(rotateY(angleOffset/pMercury), mult(translate(orMercury, 0.0, 0.0), rotateY(currentDay * 1.2))));
    drawSphere( mercuryTexture, size );
    stack.pop();

    // Venus
    size = rVenus * rPlanetMult;
    stack.push(mult(rotateY(angleOffset/pVenus), mult(translate(orVenus, 0.0, 0.0), rotateY(currentDay * 1.0))));
    drawSphere( venusTexture, size );
    stack.pop();

    // Earth
    size = rEarth * rPlanetMult;
    stack.push(mult(rotateY(angleOffset/pEarth), mult(translate(orEarth, 0.0, 0.0), rotateY(currentDay * 1.0))));
    drawSphere( earthTexture, size );

    // Moon
    size = rMoon * rPlanetMult;
    var ctm = mult(rotateY(angleOffset/pMoon), translate(orMoon * 50, 0.0, 0.0));
    ctm = mult(stack.pop(), ctm);
    stack.push(ctm);
    drawSphere( moonTexture, size );
    stack.pop();
}

function drawDay() {
    if(document.getElementById("dayon").checked == true)
    {
        var string = 'Day ' + currentDay.toString();
        printDay.innerHTML = string;
    }
    else
        printDay.innerHTML = "";
}

function drawAll() {
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );

    // all planets and orbits will take the following transformation

    // for trackball
    m_inc = build_rotmatrix(m_curquat);
    // orthogonal projection matrix * trackball rotation matrix
    commonMVMatrix = mult(ortho(-1, 1, -1, 1, -1, 1), m_inc);

    // global scaling
    commonMVMatrix = mult(scalem(globalScale, globalScale, globalScale), commonMVMatrix);

    var lightColor = vec4(lightColorR, lightColorG, lightColorB, 1.0);
    gl.uniform4fv( u_lightColorLoc, flatten(lightColor) );

    if (document.getElementById("orbon").checked == true)
        drawOrbits();

    drawBodies();
    drawDay();
}

function mouseMotion( x,  y) {
        var lastquat;
        if (m_mousex != x || m_mousey != y)
        {
            lastquat = trackball(
                  (2.0*m_mousex - canvas.width) / canvas.width,
                  (canvas.height - 2.0*m_mousey) / canvas.height,
                  (2.0*x - canvas.width) / canvas.width,
                  (canvas.height - 2.0*y) / canvas.height);
            m_curquat = add_quats(lastquat, m_curquat);
            m_mousex = x;
            m_mousey = y;
        }
}

var render = function() {
    // Calculate the elapsed time
    var now = Date.now(); // time in ms
    elapsed += now - g_last;
    g_last = now;
    if (elapsed >= mspf) {
        if(document.getElementById("animon").checked == true)
            currentDay += daysPerFrame;
        elapsed = 0;
    }

    requestAnimFrame(render);
    drawAll();
}
