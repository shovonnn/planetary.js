(function() {
  var canvas = document.getElementById('quakeCanvas');

  // Create our Planetary.js planet and set some initial values;
  // we use several custom plugins, defined at the bottom of the file
  var planet = planetaryjs.planet();
  planet.loadPlugin(autocenter({extraHeight: -120}));
  planet.loadPlugin(autoscale({extraHeight: -120}));
  planet.loadPlugin(planetaryjs.plugins.earth({
    topojson: { file:   '/world-110m.json' },
    oceans:   { fill:   '#001320' },
    land:     { fill:   '#06304e' },
    borders:  { stroke: '#001320' }
  }));
  planet.loadPlugin(planetaryjs.plugins.pings({}));
  planet.loadPlugin(zoom());
  planet.loadPlugin(drag({
    onDragStart: function() {
      planet.plugins.autorotate.pause();
    },
    onDragEnd: function() {
      planet.plugins.autorotate.resume();
    }
  }));
  planet.loadPlugin(autorotate(5));
  planet.projection.rotate([100, -10, 0]);
  planet.draw(canvas);


  // Create a color scale for the various earthquake magnitudes; the
  // mininum magnitude in our data set is 2.5.
  var colors = d3.scale.pow()
    .exponent(2)
    .domain([2, 6,10])
      .range(['rgb(255,255,204)', 'rgb(253,141,60)','rgb(128,0,38)'])
    .clamp(true);
  // Also create a scale for mapping magnitues to ping angle sizes
  var angles = d3.scale.pow()
    .exponent(2)
    .domain([2.5, 10])
    .range([0.5, 15])
    .clamp(true);

  // Create a key to show the magnitues and their colors
  d3.select('#magnitues').selectAll('li')
    .data(colors.ticks(9))
  .enter()
    .append('li')
    .style('color', colors)
    .text(function(d) {
      return "Magnitude " + d;
    });


  // Load our earthquake data and set up the controls.
  // The data consists of an array of objects in the following format:
  // {
  //   mag:  magnitude_of_quake
  //   lng:  longitude_coordinates
  //   lat:  latitude_coordinates
  //   time: timestamp_of_quake
  // }
  // The data is ordered, with the earliest data being the first in the file.
  d3.json('/examples/quake/year_quakes_small.json', function(err, data) {
    if (err) {
      alert("Problem loading the quake data.");
      return;
    }

    var start = parseInt(data[0].time, 10);
    var end = parseInt(data[data.length - 1].time, 10);
    var currentTime = start;
    var lastTick = new Date().getTime();

    // A scale that maps a percentage of playback to a time
    // from the data; for example, `50` would map to the halfway
    // mark between the first and last items in our data array.
    var percentToDate = d3.scale.linear()
      .domain([0, 100])
      .range([start, end]);

    // A scale that maps real time passage to data playback time.
    // 12 minutes of real time maps to the entirety of the
    // timespan covered by the data.
    var realToData = d3.scale.linear()
      .domain([0, 1000 * 60 * 12])
      .range([0, end - start]);

    var paused = false;

    // Pause playback and update the time display
    // while scrubbing using the range input.
    d3.select('#slider')
      .on('change', function(d) {
        currentTime = percentToDate(d3.event.target.value);
        d3.select('#date').text(new Date(currentTime));
      })
      .call(d3.behavior.drag()
        .on('dragstart', function() {
          paused = true;
        })
        .on('dragend', function() {
          paused = false;
        })
      );


    // The main playback loop; for each tick, we'll see how much
    // time passed in our accelerated playback reel and find all
    // the earthquakes that happened in that timespan, adding
    // them to the globe with a color and angle relative to their magnitudes.
    d3.timer(function() {
      var now = new Date().getTime();

      if (paused) {
        lastTick = now;
        return;
      }

      var realDelta = now - lastTick;
      // Avoid switching back to the window only to see thousands of pings;
      // if it's been more than 500 milliseconds since we've updated playback,
      // we'll just set the value to 500 milliseconds.
      if (realDelta > 500) realDelta = 500;
      var dataDelta = realToData(realDelta);

      var toPing = data.filter(function(d) {
        return d.time > currentTime && d.time <= currentTime + dataDelta;
      });

      for (var i = 0; i < toPing.length; i++) {
        var ping = toPing[i];
        planet.plugins.pings.add(ping.lat, ping.lng, {
          // Here we use the `angles` and `colors` scales we built earlier
          // to convert magnitudes to appropriate angles and colors.
          angle: angles(ping.mag),
          color: colors(ping.mag)
        });
      }

      currentTime += dataDelta;
      d3.select('#date').text(new Date(currentTime));
      d3.select('#slider').property('value', percentToDate.invert(currentTime));
      lastTick = now;
    });
  });



  // Plugin to resize the canvas to fill the window and to
  // automatically center the planet when the window size changes
  function autocenter(options) {
    var needsCentering = false;
    var resize = function() {
      var width  = window.innerWidth + (options.extraWidth || 0);
      var height = window.innerHeight + (options.extraHeight || 0);
      planet.canvas.width = width;
      planet.canvas.height = height;
      planet.projection.translate([width / 2, height / 2]);
    };

    return function(planet) {
      planet.onInit(function() {
        needsCentering = true;
        d3.select(window).on('resize', function() {
          needsCentering = true;
        });
      });

      planet.onDraw(function() {
        if (needsCentering) { resize(); needsCentering = false; }
      });
    };
  };

  // Plugin to automatically scale the planet's projection based
  // on the window size when the planet is initialized
  function autoscale(options) {
    return function(planet) {
      planet.onInit(function() {
        var width  = window.innerWidth + (options.extraWidth || 0);
        var height = window.innerHeight + (options.extraHeight || 0);
        planet.projection.scale(Math.min(width, height) / 2);
      });
    };
  };

  // Plugin to automatically rotate the globe around its vertical
  // axis a configured number of degrees every second.
  function autorotate(degPerSec) {
    return function(planet) {
      var lastTick = null;
      var paused = false;
      planet.plugins.autorotate = {
        pause:  function() { paused = true;  },
        resume: function() { paused = false; }
      };
      planet.onDraw(function() {
        if (paused || !lastTick) {
          lastTick = new Date();
        } else {
          var now = new Date();
          var delta = now - lastTick;
          var rotation = planet.projection.rotate();
          rotation[0] += degPerSec * delta / 1000;
          if (rotation[0] >= 180) rotation[0] -= 360;
          planet.projection.rotate(rotation);
          lastTick = now;
        }
      });
    };
  };

  // Plugin to allow zooming with the mouse wheel
  function zoom(options) {
    return function(planet) {
      planet.onInit(function() {
        var zoom = d3.behavior.zoom()
          .scale(planet.projection.scale())
          .scaleExtent([50, 5000])
          .on('zoom', function() {
            planet.projection.scale(d3.event.scale);
          });
        d3.select(planet.canvas).call(zoom);
      });
    };
  };

  // Plugin to allow rotating the globe by dragging with the mouse
  function drag(options) {
    var options = options || {};
    var noop = function() {};
    var onDragStart = options.onDragStart || noop;
    var onDragEnd   = options.onDragEnd   || noop;
    var onDrag      = options.onDrag      || noop;
    return function(planet) {
      planet.onInit(function() {
        var drag = d3.behavior.drag()
          .on('dragstart', onDragStart)
          .on('dragend', onDragEnd)
          .on('drag', function() {
            onDrag();
            var dx = d3.event.dx;
            var dy = d3.event.dy;
            var rotation = planet.projection.rotate();
            var radius = planet.projection.scale();
            // Dragging from the center of the planet to the edge
            // of the planet should rotate it 90 degrees
            var scale = d3.scale.linear()
              .domain([-1 * radius, radius])
              .range([-90, 90]);
            var degX = scale(dx);
            var degY = scale(dy);
            rotation[0] += degX;
            rotation[1] -= degY;
            if (rotation[1] > 90)   rotation[1] = 90;
            if (rotation[1] < -90)  rotation[1] = -90;
            if (rotation[0] >= 180) rotation[0] -= 360;
            planet.projection.rotate(rotation);
          });
        d3.select(planet.canvas).call(drag);
      });
    };
  };
})();

// var addWithMag = function(mag, time) {
//   setTimeout(function() {
//     var lng = planet.projection.rotate()[0];
//     planet.plugins.pings.add(0, lng * -1, {
//       color: colors(mag),
//       angle: angles(mag)
//     });
//   }, time)
// }
//
// doThemAll = function() {
//   for(var i = 1; i <= 10; i++) {
//     addWithMag(i, i * 2000);
//   }
//   setTimeout(doThemAll, 10 * 2000);
// }
// doThemAll();
