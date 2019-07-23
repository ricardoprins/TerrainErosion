'use strict'

var Camera = function () {
    var azimuth = INITIAL_AZIMUTH,
        elevation = INITIAL_ELEVATION,

        viewMatrix = makeIdentityMatrix(new Float32Array(16)),
        position = new Float32Array(3),
        changed = true;

    this.changeAzimuth = function (deltaAzimuth) {
        azimuth += deltaAzimuth;
        azimuth = clamp(azimuth, MIN_AZIMUTH, MAX_AZIMUTH);
        changed = true;
    };

    this.changeElevation = function (deltaElevation) {
        elevation += deltaElevation;
        elevation = clamp(elevation, MIN_ELEVATION, MAX_ELEVATION);
        changed = true;
    };

    this.getPosition = function () {
        return position;
    };

    var orbitTranslationMatrix = makeIdentityMatrix(new Float32Array(16)),
        xRotationMatrix = new Float32Array(16),
        yRotationMatrix = new Float32Array(16),
        distanceTranslationMatrix = makeIdentityMatrix(new Float32Array(16));

    this.getViewMatrix = function () {
        if (changed) {
            makeIdentityMatrix(viewMatrix);

            makeXRotationMatrix(xRotationMatrix, elevation);
            makeYRotationMatrix(yRotationMatrix, azimuth);
            distanceTranslationMatrix[14] = -CAMERA_DISTANCE;
            orbitTranslationMatrix[12] = -ORBIT_POINT[0];
            orbitTranslationMatrix[13] = -ORBIT_POINT[1];
            orbitTranslationMatrix[14] = -ORBIT_POINT[2];

            premultiplyMatrix(viewMatrix, viewMatrix, orbitTranslationMatrix);
            premultiplyMatrix(viewMatrix, viewMatrix, yRotationMatrix);
            premultiplyMatrix(viewMatrix, viewMatrix, xRotationMatrix);
            premultiplyMatrix(viewMatrix, viewMatrix, distanceTranslationMatrix);

            position[0] = CAMERA_DISTANCE * Math.sin(Math.PI / 2 - elevation) * Math.sin(-azimuth) + ORBIT_POINT[0];
            position[1] = CAMERA_DISTANCE * Math.cos(Math.PI / 2 - elevation) + ORBIT_POINT[1];
            position[2] = CAMERA_DISTANCE * Math.sin(Math.PI / 2 - elevation) * Math.cos(-azimuth) + ORBIT_POINT[2];

            changed = false;
        }

        return viewMatrix;
    };
};
