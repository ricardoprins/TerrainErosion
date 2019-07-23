'use strict'

var QUAD_VERTEX_SOURCE = [
    'precision highp float;',
    
    'attribute vec3 a_position;',
    'attribute vec3 a_texCoord;',
    
    'varying vec3 v_position;',

    'uniform mat4 u_projection;',
    'uniform mat4 u_view;',
    
    'uniform float u_waterLevel;',
    'uniform float u_verticalScale;',

    'void main (void) {',
        'v_position = a_position;',
        'v_position.y -= 20.0;',
        'v_position.y = max(u_waterLevel, v_position.y);',
        'gl_Position = u_projection * u_view * vec4(v_position, 1.0);',
    '}',
].join('\n');

var QUAD_FRAGMENT_SOURCE = [
    'precision highp float;',

    'varying vec3 v_position;',
    
    'uniform vec3 u_color;',
    
    'uniform float u_waterLevel;',
    'uniform float u_snowLevel;',
    
    'const vec3 waterColor = vec3(0.00, 0.00, 0.33);',
    'const vec3 snowColor = vec3(0.90, 0.90, 0.90);',
    'const vec3 groundColor = vec3(0.66, 0.33, 0.00);',
    
    'vec3 getColor(float elevation) {',
        'if (elevation<=u_waterLevel) {',
            'return waterColor;',
        '}',
        'if (elevation>u_snowLevel) {',
            'return snowColor;',
        '}',
        'return groundColor;',
    '}',

    'void main (void) {',
        'vec3 color = getColor(v_position.y);',
        'gl_FragColor = vec4(color * u_color, 1.0);',
    '}',
].join('\n');

var Simulator = function(canvas, width, height) {
    var canvas = canvas;
    canvas.width = width;
    canvas.height = height;
    
    var waterLevel = WATER_LEVEL,
        snowLevel = SNOW_LEVEL,
        verticalScale = VERTICAL_SCALE;
        
    var iterations = INITIAL_ITERATIONS;
    
    var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

    gl.clearColor.apply(gl, CLEAR_COLOR);
    gl.enable(gl.DEPTH_TEST);

    var quadProgram = gl.createProgram();
    var quadProgram = buildProgramWrapper(gl,
        buildShader(gl, gl.VERTEX_SHADER, QUAD_VERTEX_SOURCE),
        buildShader(gl, gl.FRAGMENT_SHADER, QUAD_FRAGMENT_SOURCE),
        {"a_position" : 0});

    var worldPosX = 0,
        worldPosY = 0;
    var heightmap = new ErodingHeightmap(GEOMETRY_RESOLUTION);
    var vossGenerator = new VossGenerator(heightmap);
    vossGenerator.generate(worldPosX, worldPosY);

    var quadColor = new Float32Array([0.0, 0.0, 0.0]);
    var outlineColor = new Float32Array([1.0, 1.0, 1.0]);
    
    gl.enableVertexAttribArray(0);

    // Vertex Buffer
    var mapMeshData = [];
    for (var zIndex = 0; zIndex < GEOMETRY_RESOLUTION; zIndex += 1) {
        for (var xIndex = 0; xIndex < GEOMETRY_RESOLUTION; xIndex += 1) {
            mapMeshData.push((xIndex * GEOMETRY_SIZE) / (GEOMETRY_RESOLUTION - 1) + GEOMETRY_ORIGIN[0]);
            mapMeshData.push((0.0));
            mapMeshData.push((zIndex * GEOMETRY_SIZE) / (GEOMETRY_RESOLUTION - 1) + GEOMETRY_ORIGIN[2]);
            mapMeshData.push((0.0));
        }
    }

    var mapMeshBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, mapMeshBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mapMeshData), gl.DYNAMIC_DRAW);
    
    this.updateMapMeshData = function() {
        for (var zIndex = 0; zIndex < GEOMETRY_RESOLUTION; zIndex += 1) {
            for (var xIndex = 0; xIndex < GEOMETRY_RESOLUTION; xIndex += 1) {
                var index = zIndex * GEOMETRY_RESOLUTION + xIndex;
                mapMeshData[index * 4 + Y_INDEX] = heightmap.getHeight(xIndex, zIndex);
            }
        }
        
        gl.bindBuffer(gl.ARRAY_BUFFER, mapMeshBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(mapMeshData));
    }

    // Mesh Index Buffer
    var mapMeshIndices = [];
    for (var zIndex = 0; zIndex < GEOMETRY_RESOLUTION - 1; zIndex += 1) {
        for (var xIndex = 0; xIndex < GEOMETRY_RESOLUTION - 1; xIndex += 1) {
            var topLeft = zIndex * GEOMETRY_RESOLUTION + xIndex,
                topRight = topLeft + 1,
                bottomLeft = topLeft + GEOMETRY_RESOLUTION,
                bottomRight = bottomLeft + 1;

            mapMeshIndices.push(topLeft);
            mapMeshIndices.push(bottomLeft);
            mapMeshIndices.push(bottomRight);
            mapMeshIndices.push(bottomRight);
            mapMeshIndices.push(topRight);
            mapMeshIndices.push(topLeft);
        }
    }

    var mapMeshIndicesBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mapMeshIndicesBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mapMeshIndices), gl.STATIC_DRAW);

    // Lines Index Buffer
    // X-lines Index Buffer
    var mapOutlineIndices = [];
    for (var xIndex = 0; xIndex < GEOMETRY_RESOLUTION; xIndex += 1) {
        for (var zIndex = 0; zIndex < GEOMETRY_RESOLUTION - 1; zIndex += 1) {
            var topIndex = zIndex * GEOMETRY_RESOLUTION + xIndex,
                bottomIndex = topIndex + GEOMETRY_RESOLUTION;
            mapOutlineIndices.push(topIndex);
            mapOutlineIndices.push(bottomIndex);
        }
    }

    // Z-lines Index Buffer
    for (var zIndex = 0; zIndex < GEOMETRY_RESOLUTION; zIndex += 1) {
        for (var xIndex = 0; xIndex < GEOMETRY_RESOLUTION - 1; xIndex += 1) {
            var leftIndex = zIndex * GEOMETRY_RESOLUTION + xIndex,
                rightIndex = leftIndex + 1;
            mapOutlineIndices.push(leftIndex);
            mapOutlineIndices.push(rightIndex);
        }
    }

    var mapOutlineIndicesBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mapOutlineIndicesBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mapOutlineIndices), gl.STATIC_DRAW);

    this.setRadius = function(newRadius) {
        heightmap.setErosionRadius(newRadius);
    };
    
    this.setIterations = function(newIterations) {
        iterations = newIterations;
    };

    this.resize = function (width, height) {
        canvas.width = width;
        canvas.height = height;
    };

    this.getCoord = function(outCoord, data, u, v) {
        var index = (u * GEOMETRY_RESOLUTION + v) * 4;

        outCoord[X_INDEX] = data[index+X_INDEX];
        outCoord[Y_INDEX] = data[index+Y_INDEX];
        outCoord[Z_INDEX] = data[index+Z_INDEX];
        outCoord[W_INDEX] = data[index+W_INDEX];

        return outCoord;
    }
    
    this.resetTerrain = function() {
        worldPosX = Math.trunc(Math.random() * 10000. - 5000.);
        worldPosY = Math.trunc(Math.random() * 10000. - 5000.);
        vossGenerator.generate(worldPosX, worldPosY);
        heightmap.erode(0, true);
    };
    
    this.render = function(deltaTime, projectionMatrix, viewMatrix) {
        heightmap.erode(iterations, false);
        this.updateMapMeshData();
        
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(quadProgram.program);

        gl.uniformMatrix4fv(quadProgram.uniformLocations['u_projection'], false, projectionMatrix);
        gl.uniformMatrix4fv(quadProgram.uniformLocations['u_view'], false, viewMatrix);
        
        gl.uniform1f(quadProgram.uniformLocations['u_waterLevel'], waterLevel);
        gl.uniform1f(quadProgram.uniformLocations['u_snowLevel'], snowLevel);
        gl.uniform1f(quadProgram.uniformLocations['u_verticalScale'], verticalScale);

        // Draw Mesh
        gl.polygonOffset(1, 0);
        gl.enable(gl.POLYGON_OFFSET_FILL);

        gl.uniform3fv(quadProgram.uniformLocations['u_color'], quadColor);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, mapMeshBuffer);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 4 * SIZE_OF_FLOAT, 0);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mapMeshIndicesBuffer);
        gl.drawElements(gl.TRIANGLES, mapMeshIndices.length, gl.UNSIGNED_SHORT, 0);

        // Draw Lines
        gl.polygonOffset(0, 0);
        gl.disable(gl.POLYGON_OFFSET_FILL);

        gl.uniform3fv(quadProgram.uniformLocations['u_color'], outlineColor);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mapOutlineIndicesBuffer);
        gl.drawElements(gl.LINES, mapOutlineIndices.length, gl.UNSIGNED_SHORT, 0);
    }
}
