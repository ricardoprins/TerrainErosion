'use strict'

var VossGenerator = function(size) {
    this.size = size;
    this.data = new Int32Array(size * size);
    this.map = new Float32Array(size * size);
    this.flags = new Int8Array(size * size);
    this.seek = 0.0;

    this.heightSeek = 2.0;
    this.slopeSeek = 2000.0;

    this.setData = function(x, y, k) { this.data[y * this.size + x] = k; };
    this.getData = function(x, y) { return this.data[y * this.size + x]; };

    this.setFlag = function(x, y, f) { this.flags[y * this.size + x] = f; };
    this.getFlag = function(x, y) { return this.flags[y * this.size + x]; };
    
    // Eroding Terrain
    var erosionRadius = INITIAL_RADIUS,
        erodeSpeed = 0.3,
        depositSpeed = 0.3,
        evaporateSpeed = 0.01,
        gravity = 4.0,
        maxDropletLifetime = 30;
        
    var initialSpeed = 1.0,
        initialWaterVolume = 1.0;
        
    var erosionBrushIndices = null,
        erosionBrushWeights = null;
        
    // At zero, water will instantly change direction to flow downhill.
    // At 1, water will never change direction. 
    var inertia = .05;
    
    // Multiplier for how much sediment a droplet can carry
    var sedimentCapacityFactor  = 4.0;
    
    // Used to prevent carry capacity getting too close to zero on flatter terrain
    var minSedimentCapacity = 0.01;
    
    this.setErosionRadius = function(newRadius) {
        erosionRadius = newRadius;
    };
    
    this.getHeight = function(posX, posY) {
        return this.map[posY * this.size + posX];
    };
    
    this.convertDataToHeight = function() {
        for (var index = 0; index < this.size * this.size; index++) {
            this.map[index] = this.data[index] / 150.0 + 20.0;
        }
    };
    
    this.getHeightAndGradient = function(heightAndGradient, posX, posY) {
        var coordX = Math.trunc(posX);
        var coordY = Math.trunc(posY);
        
        // Calculate droplet's offset inside the cell (0,0) = at NW node, (1,1) = at SE node
        var x = posX - coordX;
        var y = posY - coordY;
        
        // Calculate heights of the four nodes of the droplet's cell
        var heightNW = this.getHeight(coordX, coordY);
        var heightNE = this.getHeight(coordX + 1, coordY);
        var heightSW = this.getHeight(coordX, coordY + 1);
        var heightSE = this.getHeight(coordX + 1, coordY + 1);
        
        // Calculate droplet's direction of flow with bilinear interpolation
        // of height difference along the edges
        var gradientX = (heightNE - heightNW) * (1 - y) + (heightSE - heightSW) * y;
        var gradientY = (heightSW - heightNW) * (1 - x) + (heightSE - heightNE) * x;
        
        // Calculate height with bilinear interpolation of the heights of the nodes of the cell
        var height = heightNW * (1 - x) * (1 - y) +
            heightNE * x * (1 - y) +
            heightSW * (1 - x) * y +
            heightSE * x * y;
        
        heightAndGradient[H_INDEX] = height;
        heightAndGradient[GX_INDEX] = gradientX;
        heightAndGradient[GY_INDEX] = gradientY;
        
        return heightAndGradient;
    };
    
    this.initializeErosion = function(mapSize, resetSeed) {
        if (erosionBrushIndices === null) {
            this.initializeBrushIndices(mapSize, erosionRadius);
        }
    };
    
    this.erode = function(numIterations, resetSeed) {
        var mapSize = this.size;
        var heightAndGradient = new Float32Array(4),
            newHeightAndGradient = new Float32Array(4);
        
        this.initializeErosion(mapSize, resetSeed);
        
        for (var iteration = 0; iteration < numIterations; iteration++) {
            // Create water droplet at random point on map
            var posX = Math.random() * (mapSize - 1),
                posY = Math.random() * (mapSize - 1),
                dirX = 0.0,
                dirY = 0.0,
                speed = initialSpeed,
                water = initialWaterVolume,
                sediment = 0.0;
                
            for (var lifetime = 0; lifetime < maxDropletLifetime; lifetime++) {
                var nodeX = Math.trunc(posX);
                var nodeY = Math.trunc(posY);
                
                var dropletIndex = nodeY * mapSize + nodeX;
                
                // Calculate droplet's offset inside the cell (0,0) = at NW node, (1,1) = at SE node
                var cellOffsetX = posX - nodeX;
                var cellOffsetY = posY - nodeY;
                
                // Calculate droplet's height and direction of flow with bilinear interpolation
                // of surrounding heights
                this.getHeightAndGradient(heightAndGradient, posX, posY);
                
                // Update the droplet's direction and position (move position 1 unit regardless of speed)
                dirX = (dirX * inertia - heightAndGradient[GX_INDEX] * (1 - inertia));
                dirY = (dirY * inertia - heightAndGradient[GY_INDEX] * (1 - inertia));
                
                // Normalize direction
                var len = Math.sqrt(dirX * dirX + dirY * dirY);
                if (len != 0.0) {
                    dirX /= len;
                    dirY /= len;
                }
                posX += dirX;
                posY += dirY;
                
                // Stop simulating droplet if it's not moving or has flowed over edge of map
                if ((dirX == 0 && dirY == 0) || posX < 0 || posX >= mapSize - 1 || posY < 0 || posY >= mapSize - 1) {
                    break;
                }
                
                // Find the droplet's new height and calculate the deltaHeight
                this.getHeightAndGradient(newHeightAndGradient, posX, posY);
                var newHeight = newHeightAndGradient[H_INDEX];
                var deltaHeight = newHeight - heightAndGradient[H_INDEX];
                
                // Calculate the droplet's sediment capacity
                // (higher when moving fast down a slope and contains lots of water)
                var sedimentCapacity = Math.max(
                    -deltaHeight * speed * water * sedimentCapacityFactor,
                    minSedimentCapacity);
                    
                // If carrying more sediment than capacity, or if flowing uphill:
                if (sediment > sedimentCapacity || deltaHeight > 0) {
                    // If moving uphill (deltaHeight > 0) try fill up to the current height,
                    // otherwise deposit a fraction of the excess sediment
                    var amountToDeposit = (deltaHeight > 0) ?
                        Math.min(deltaHeight, sediment) :
                        (sediment - sedimentCapacity) * depositSpeed;
                    sediment -= amountToDeposit;
                    
                    // Add the sediment to the four nodes of the current cell using bilinear interpolation
                    // Deposition is not distributed over a radius (like erosion) so that it can fill small pits
                    this.map[dropletIndex] += amountToDeposit * (1 - cellOffsetX) * (1 - cellOffsetY);
                    this.map[dropletIndex + 1] += amountToDeposit * cellOffsetX * (1 - cellOffsetY);
                    this.map[dropletIndex + mapSize] += amountToDeposit * (1 - cellOffsetX) * cellOffsetY;
                    this.map[dropletIndex + mapSize + 1] += amountToDeposit * cellOffsetX * cellOffsetY;
                }
                else {
                    // Erode a fraction of the droplet's current carry capacity.
                    // Clamp the erosion to the change in height so that it doesn't dig a hole in the terrain behind the droplet
                    var amountToErode = Math.min(
                        (sedimentCapacity - sediment) * erodeSpeed,
                        -deltaHeight);
                        
                    // Use erosion brush to erode from all nodes inside the droplet's erosion radius
                    for (var brushPointIndex = 0; brushPointIndex < erosionBrushIndices[dropletIndex].length; brushPointIndex++) {
                        var nodeIndex = erosionBrushIndices[dropletIndex][brushPointIndex];
                        var weighedErodeAmount = amountToErode * erosionBrushWeights[dropletIndex][brushPointIndex];
                        var deltaSediment = (this.map[nodeIndex] < weighedErodeAmount) ?
                            this.map[nodeIndex] :
                            weighedErodeAmount;
                        this.map[nodeIndex] -= deltaSediment;
                        sediment += deltaSediment;
                    }
                }
                
                // Update droplet's speed and water content
                speed = speed * speed + deltaHeight * gravity;
                if (speed < 0.0) {
                    speed = 0.0;
                }
                else {
                    speed = Math.sqrt(speed);
                }
                water *= (1 - evaporateSpeed);
            }
        }
    };
    
    this.initializeBrushIndices = function(mapSize, radius) {
        erosionBrushIndices = new Array(mapSize * mapSize);
        erosionBrushWeights = new Array(mapSize * mapSize);
        
        var xOffsets = new Int32Array(radius * radius * 4);
        var yOffsets = new Int32Array(radius * radius * 4);
        var weights  = new Float32Array(radius * radius * 4);
        
        var weightSum = 0.0;
        var addIndex = 0;
        
        for (var i = 0; i < erosionBrushIndices.length; i++) {
            var centreX = i % mapSize;
            var centreY = Math.trunc(i / mapSize);
            
            if (centreY <= radius || centreY >= mapSize - radius || centreX <= radius + 1 || centreX >= mapSize - radius) {
                weightSum = 0;
                addIndex = 0;
                for (var y = -radius; y <= radius; y++) {
                    for (var x = -radius; x <= radius; x++) {
                        var sqrDst = x * x + y * y;
                        if (sqrDst < radius * radius) {
                            var coordX = centreX + x;
                            var coordY = centreY + y;
                            
                            if (coordX >= 0 && coordX < mapSize && coordY >= 0 && coordY < mapSize) {
                                var weight = 1.0 - Math.sqrt(sqrDst) / radius;
                                
                                weightSum += weight;
                                weights[addIndex] = weight;
                                
                                xOffsets[addIndex] = x;
                                yOffsets[addIndex] = y;
                                addIndex++;
                            }
                        }
                    }
                }
            }
            
            var numEntries = addIndex;
            erosionBrushIndices[i] = new Int32Array(numEntries);
            erosionBrushWeights[i] = new Float32Array(numEntries);
            
            for (var j = 0; j < numEntries; j++) {
                erosionBrushIndices[i][j] = (yOffsets[j] + centreY) * mapSize + xOffsets[j] + centreX;
                erosionBrushWeights[i][j] = weights[j] / weightSum;
            }
        }
    };

    // Voss Generator
    this.generate = function(x, y) {
        // Clear map
        for (var i=0; i<this.size*this.size; i++) {
            this.data[i] = 0;
            this.flags[i] = true;
        }

        // Set corner values
        this.data[0] = 0;
        this.data[this.size - 1] = 0;
        this.data[this.size * (this.size - 1) - 1] = 0;
        this.data[this.size * this.size - 1] = 0;

        this.seek = x * 1e-3 + y * 1e-6;
        this.sideVoss(0, 0, this.size - 1, 0, 1.0);
        this.seek = y * 1e-3 + x * 1e-6 + 0.1;
        this.sideVoss(0, 0, 0, this.size - 1, 1.0);

        this.seek = (x + 1) * 1e-3 + y * 1e-6;
        this.sideVoss(0, this.size - 1, this.size - 1, this.size - 1, 1.0);
        this.seek = (y + 1) * 1e-3 + x * 1e-6 + 0.1;
        this.sideVoss(this.size - 1, 0, this.size - 1, this.size - 1, 1.0);

        this.iterationVoss(0, 0, this.size - 1, this.size - 1, 1.0);
        
        this.convertDataToHeight();
    };

    this.sideVoss = function(x1, y1, x2, y2, D) {
        if (x1 === x2) {
            if ((y2 - y1) <= 1) {
                return;
            }

            var y3 = Math.floor(y1 + (y2 - y1) / 2);

            var b = Math.floor((this.getData(x1, y1) + this.getData(x1, y2)) / 2
                + Math.round(this.slopeSeek * this.nrand(0.0, D)));
            this.setData(x1, y3, b);
            this.setFlag(x1, y3, false);

            D = Math.exp(2.0 * this.heightSeek * Math.log(0.5)) * D;
            this.sideVoss(x1, y1, x2, y3, D);
            this.sideVoss(x1, y3, x2, y2, D);
        }
        else {
            if ((x2 - x1) <= 1) {
                return;
            }

            var x3 = Math.floor(x1 + (x2 - x1) / 2);

            var b = Math.floor(((this.getData(x1, y1) + this.getData(x2, y1)) / 2
                + Math.round(this.slopeSeek * this.nrand(0.0, D))));
            this.setData(x3, y1, b);
            this.setFlag(x3, y1, false);

            D = Math.exp(2.0 * this.heightSeek * Math.log(0.5)) * D;
            this.sideVoss(x1, y1, x3, y2, D);
            this.sideVoss(x3, y1, x2, y2, D);
        }
    };

    this.iterationVoss = function(x1, y1, x2, y2, D) {
        if (((x2 - x1) <= 1)
            || ((y2 - y1) <= 1)) {
            return;
        }
        
        var x3 = Math.floor(x1 + (x2 - x1) / 2);
        var y3 = Math.floor(y1 + (y2 - y1) / 2);

        if (this.getFlag(x3, y3)) {
            var b = Math.floor((this.getData(x1, y1) + this.getData(x1, y2)
                + this.getData(x2, y1) + this.getData(x2, y2)) / 4
                + Math.round(this.slopeSeek * this.nrand(0.0, D)));
            this.setData(x3, y3, b);
            this.setFlag(x3, y3, false);
        }

        if (this.getFlag(x1, y3)) {
            var b = Math.floor((this.getData(x1, y1) + this.getData(x1, y2)) / 2
                + Math.round(this.slopeSeek * this.nrand(0.0, D)));
            this.setData(x1, y3, b);
            this.setFlag(x1, y3, false);
        }

        if (this.getFlag(x3, y1)) {
            var b = Math.floor((this.getData(x1, y1) + this.getData(x2, y1)) / 2
                + Math.round(this.slopeSeek * this.nrand(0.0, D)));
            this.setData(x3, y1, b);
            this.setFlag(x3, y1, false);
        }

        if (this.getFlag(x2, y3)) {
            var b = Math.floor((this.getData(x2, y1) + this.getData(x2, y2)) / 2
                + Math.round(this.slopeSeek * this.nrand(0.0, D)));
            this.setData(x2, y3, b);
            this.setFlag(x2, y3, false);
        }

        if (this.getFlag(x3, y2)) {
            var b = Math.floor((this.getData(x1, y2) + this.getData(x2, y2)) / 2
                + Math.round(this.slopeSeek * this.nrand(0.0, D)));
            this.setData(x3, y2, b);
            this.setFlag(x3, y2, false);
        }

        D = Math.exp(1.0 * this.heightSeek * Math.log(0.5)) * D;

        this.iterationVoss(x1, y1, x3, y3, D);
        this.iterationVoss(x3, y1, x2, y3, D);
        this.iterationVoss(x3, y3, x2, y2, D);
        this.iterationVoss(x1, y3, x3, y2, D);
    };

    this.drand = function() {
        this.seek = frac(11.0 * this.seek + Math.PI);
        return this.seek;
    };

    this.nrand = function(a, D) {
        var x = 0.0;

        for (var i=0; i<10; i++) {
            x += this.drand();
        }
        x = (x - 5.0) * Math.sqrt(D) / (Math.sqrt(10.0 / 12.0)) + a;
        return x;
    };
}