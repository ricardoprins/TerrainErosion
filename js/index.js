'use strict'

var main = function () {
    var simulatorCanvas = document.getElementById(SIMULATOR_CANVAS_ID),
        overlayDiv = document.getElementById(OVERLAY_DIV_ID),
        uiDiv = document.getElementById(UI_DIV_ID);

    var simulator = new Simulator(simulatorCanvas, 640, 480);

    var radiusSlider = new Slider(document.getElementById('radius-slider'), MIN_RADIUS, MAX_RADIUS, INITIAL_RADIUS, function (value) {
        simulator.setRadius(value);
    });
    var iterationsSlider = new Slider(document.getElementById('iterations-slider'), MIN_ITERATIONS, MAX_ITERATIONS, INITIAL_ITERATIONS, function (value) {
        simulator.setIterations(value);
    });

    radiusSlider.setColor(DEFAULT_UI_COLOR);
    iterationsSlider.setColor(DEFAULT_UI_COLOR);

    var camera = new Camera();
    var projectionMatrix = makePerspectiveMatrix(new Float32Array(16), FOV, MIN_ASPECT, NEAR, FAR);
    
    var width = window.innerWidth,
        height = window.innerHeight;

    var lastMouseX = 0;
    var lastMouseY = 0;
    var mode = NONE;

    var setUIPerspective = function (height) {
        var fovValue = 0.5 / Math.tan(FOV / 2) * height;
        setPerspective(uiDiv, fovValue + 'px');
    };
    
    var onMouseDown = function (event) {
        event.preventDefault();

        var mousePosition = getMousePosition(event, uiDiv);
        var mouseX = mousePosition.x,
            mouseY = mousePosition.y;

        mode = ORBITING;
        lastMouseX = mouseX;
        lastMouseY = mouseY;
    };
    overlayDiv.addEventListener('mousedown', onMouseDown, false);

    overlayDiv.addEventListener('mousemove', function (event) {
        event.preventDefault();

        var mousePosition = getMousePosition(event, uiDiv),
            mouseX = mousePosition.x,
            mouseY = mousePosition.y;

        if (mode === ORBITING) {
            overlayDiv.style.cursor = '-webkit-grabbing';
            overlayDiv.style.cursor = '-moz-grabbing';
            overlayDiv.style.cursor = 'grabbing';
        }
        else {
            overlayDiv.style.cursor = '-webkit-grab';
            overlayDiv.style.cursor = '-moz-grab';
            overlayDiv.style.cursor = 'grab';
        }

        if (mode === ORBITING) {
            camera.changeAzimuth((mouseX - lastMouseX) / width * SENSITIVITY);
            camera.changeElevation((mouseY - lastMouseY) / height * SENSITIVITY);
            lastMouseX = mouseX;
            lastMouseY = mouseY;
        }
    });

    overlayDiv.addEventListener('mouseup', function (event) {
        event.preventDefault();
        mode = NONE;
    });

    window.addEventListener('mouseout', function (event) {
        var from = event.relatedTarget || event.toElement;
        if (!from || from.nodeName === 'HTML') {
            mode = NONE;
        }
    });

    var onresize = function () {
        var windowWidth = window.innerWidth,
            windowHeight = window.innerHeight;

        overlayDiv.style.width = windowWidth + 'px';
        overlayDiv.style.height = windowHeight + 'px';

        if (windowWidth / windowHeight > MIN_ASPECT) {
            makePerspectiveMatrix(projectionMatrix, FOV, windowWidth / windowHeight, NEAR, FAR);
            simulator.resize(windowWidth, windowHeight);
            uiDiv.style.width = windowWidth + 'px';
            uiDiv.style.height = windowHeight + 'px';
            simulatorCanvas.style.top = '0px';
            uiDiv.style.top = '0px';
            setUIPerspective(windowHeight);
            width = windowWidth;
            height = windowHeight;
        } else {
            var newHeight = windowWidth / MIN_ASPECT;
            makePerspectiveMatrix(projectionMatrix, FOV, windowWidth / newHeight, NEAR, FAR);
            simulator.resize(windowWidth, newHeight);
            simulatorCanvas.style.top = (windowHeight - newHeight) * 0.5 + 'px';
            uiDiv.style.top = (windowHeight - newHeight) * 0.5 + 'px';
            setUIPerspective(newHeight);
            uiDiv.style.width = windowWidth + 'px';
            uiDiv.style.height = newHeight + 'px';
            width = windowWidth;
            height = newHeight;
        }
    };

    window.addEventListener('resize', onresize);
    onresize();

    var lastTime = (new Date()).getTime();
    var render = function render (currentTime) {
        var deltaTime = (currentTime - lastTime) / 1000 || 0.0;
        lastTime = currentTime;

        simulator.render(deltaTime, projectionMatrix, camera.getViewMatrix());

        requestAnimationFrame(render);
    };
    render();
}

main();
