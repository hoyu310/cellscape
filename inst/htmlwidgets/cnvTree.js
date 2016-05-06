HTMLWidgets.widget({

    name: 'cnvTree',

    type: 'output',

    initialize: function(el, width, height) {

        // defaults
        var defaults = {
            widgetMargin: 10, // marging between widgets
            tree_r: 4, // tree node radius
            tree_w_labels_r: 7, // tree node radius when labels displayed within
            indicatorWidth: 7, // width of the selected single cell indicator
            groupAnnotWidth: 10, // width of the selected single cell group annotation
            defaultNodeColour: "#3458A5",
            highlightColour: "#000000",
            linkHighlightColour: "#000000",
            defaultLinkColour: "#B7B7B7",
            chromLegendHeight: 15,
            cnvLegendWidth: 50,
            groupAnnotStart: 140, // starting y-pixel for group annotation legend
            titleHeight: 14, // height of legend titles
            rectHeight: 12, // rectangle in legend
            spacing: 2, // spacing between legend rectangles
            fontHeight: 12,
            topBarHeight: 30, // height of top panel
            topBarColour: "#D9D9D9",
            topBarHighlight: "#C6C6C6",
            spaceBelowTopBar: 15 // amount of space (px) below the top bar
        };

        // global variable vizObj
        vizObj = {};
        vizObj.data = {};
        vizObj.view = {};

        // selected single cells list & selected links list
        vizObj.view.selectedSCs = [];
        vizObj.view.selectedLinks = [];

        // general configurations
        var config = $.extend(true, {}, defaults);
        config.width = width - 15; // - 15 because vertical scrollbar takes 15 px
        config.height = height - 15; // - 15 because vertical scrollbar takes 15 px

        // cnv configurations
        config.cnvHeight = config.height - config.topBarHeight - config.spaceBelowTopBar;
        config.cnvTop = 0;
        config.cnvBottom = (config.cnvHeight-config.chromLegendHeight);

        // indicator configurations
        config.indicatorHeight = config.height - config.topBarHeight - config.spaceBelowTopBar;

        // group annotation configurations
        config.groupAnnotHeight = config.height - config.topBarHeight - config.spaceBelowTopBar;

        // cnv legend configurations
        config.cnvLegendHeight = config.height - config.topBarHeight - config.spaceBelowTopBar;

        vizObj.generalConfig = config;

        return {}

    },

    renderValue: function(el, x, instance) {

        var config = vizObj.generalConfig;
        var view_id = el.id;

        // GET PARAMS FROM R

        vizObj.userConfig = x;
        vizObj.view.groupsSpecified = (vizObj.userConfig.sc_groups != null); // (T/F) group annotation is specified

        // UPDATE GENERAL PARAMS, GIVEN USER PARAMS

        // tree configurations
        config.treeWidth = config.width - config.indicatorWidth - config.cnvLegendWidth - vizObj.userConfig.cnvWidth;
        config.treeHeight = config.height - config.topBarHeight - config.spaceBelowTopBar;

        // if group annotation specified, reduce the width of the tree
        if (vizObj.view.groupsSpecified) {
            config.treeWidth -= config.groupAnnotWidth;
        }

        // GET TREE CONTENT

        // if the user hasn't specified a custom single cell id order for the cnv heatmap, order by tree
        if (!vizObj.userConfig.sc_ids_ordered) {
            // get order of nodes from tree
            var nodeOrder = _getNodeOrder(vizObj.userConfig.link_ids, vizObj.userConfig.root, []);
            vizObj.userConfig.sc_ids_ordered = nodeOrder
        }

        // keep track of original list of scs, for tree pruning purposes
        vizObj.view.original_sc_list = $.extend([], vizObj.userConfig.sc_ids_ordered);


        // GET CNV CONTENT

        // cnv plot number of rows
        vizObj.view.cnv = {};
        vizObj.view.cnv.nrows = vizObj.userConfig.sc_ids_ordered.length;

        // height of each cnv row
        vizObj.view.cnv.rowHeight = (1/vizObj.view.cnv.nrows)*(config.cnvHeight-config.chromLegendHeight);

        // get group annotation info as object w/properties group : [array of single cells]
        if (vizObj.view.groupsSpecified) {
            _reformatGroupAnnots(vizObj);
        }

        console.log("vizObj");
        console.log(vizObj);

        // COLOURS

        // cnv colour scale
        var maxCNV = 6;
        var colorScale = d3.scale.ordinal()
            .domain([0,1,2,3,4,5,6])
            .range(["#2e7aab", "#73a9d4", "#D6D5D5", "#fec28b", "#fd8b3a", "#ca632c", "#954c25"]);

        // group annotation colours
        if (vizObj.view.groupsSpecified) {
            vizObj.view.colour_assignment = _getColours(_.uniq(_.pluck(vizObj.userConfig.sc_groups, "group")));
        }

        // BRUSH SELECTION FUNCTION

        var brush = d3.svg.brush()
            .y(d3.scale.linear().domain([0, config.cnvHeight]).range([0, config.cnvHeight]))
            .on("brushstart", function() { d3.select(".cnvSVG").classed("brushed", true); })
            .on("brushend", function() {
                return _brushEnd(vizObj, brush);
            });

        // TOP BAR DIV

        var topBarDIV = d3.select(el).append("div")
            .attr("class", "topBarDIV")
            .style("position", "relative")
            .style("width", config.width + "px")
            .style("height", config.topBarHeight + "px")
            .style("float", "left");

        // SPACE BETWEEN TOP BAR AND VIEW DIV

        var spaceDIV = d3.select(el)
            .append("div")
            .attr("class", "spaceDIV")
            .style("width", config.width + "px")
            .style("height", config.spaceBelowTopBar + "px")
            .style("float", "left");

        // CONTAINER DIV

        var containerDIV = d3.select(el)
            .append("div")
            .attr("class", "containerDIV")
            .style("width", config.width + "px")
            .style("height", config.cnvHeight + "px")
            .style("float", "left");

        // TREE SVG

        var treeSVG = containerDIV
            .append("svg:svg")
            .attr("class", "treeSVG")
            .attr("width", config.treeWidth + "px")
            .attr("height", config.treeHeight + "px")
            .on('dblclick', function() {

                // turn off node & link selection
                d3.selectAll(".nodeSelected")
                    .classed("nodeSelected",false);
                d3.selectAll(".linkSelected")
                    .classed("linkSelected",false);

                // reset nodes, links & indicators
                _resetNodes(vizObj);
                _resetLinks(vizObj);
                _resetIndicators();
            })

        // INDICATOR SVG

        var indicatorSVG = containerDIV
            .append("svg:svg")
            .attr("class", "indicatorSVG")
            .attr("width", config.indicatorWidth + "px")
            .attr("height", config.indicatorHeight + "px");

        // GROUP ANNOTATION SVG

        if (vizObj.view.groupsSpecified) {
            var groupAnnotSVG = containerDIV
                .append("svg:svg")
                .attr("class", "groupAnnotSVG")
                .attr("width", config.groupAnnotWidth + "px")
                .attr("height", config.groupAnnotHeight + "px");
        }

        // CNV SVG

        var cnvSVG = containerDIV
            .append("svg:svg")
            .attr("class", "cnvSVG")
            .attr("width", vizObj.userConfig.cnvWidth + "px")
            .attr("height", config.cnvHeight + "px")

        // CNV LEGEND SVG

        var cnvLegendSVG = containerDIV
            .append("svg:svg")
            .attr("class", "cnvLegendSVG")
            .attr("width", config.cnvLegendWidth + "px")
            .attr("height", config.cnvLegendHeight + "px")

        // PLOT TOP PANEL

        // svg
        var topBarSVG = topBarDIV.append("svg:svg")
            .attr("class", "topBar")
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", config.width + "px")
            .attr("height", config.topBarHeight + "px");

        // background bar
        topBarSVG.append("rect")
            .attr("x",0)
            .attr("y",0)
            .attr("width", config.width + "px")
            .attr("height", config.topBarHeight)
            .attr("rx", 10)
            .attr("ry", 10)
            .attr("fill", config.topBarColour);

        var smallButtonWidth = 42; // width of the top panel reset button

        var selectionButton_base64 = "data:image/svg+xml;utf8;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iaXNvLTg4NTktMSI/Pgo8IS0tIEdlbmVyYXRvcjogQWRvYmUgSWxsdXN0cmF0b3IgMTguMS4xLCBTVkcgRXhwb3J0IFBsdWctSW4gLiBTVkcgVmVyc2lvbjogNi4wMCBCdWlsZCAwKSAgLS0+CjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgdmVyc2lvbj0iMS4xIiBpZD0iQ2FwYV8xIiB4PSIwcHgiIHk9IjBweCIgdmlld0JveD0iMCAwIDU3LjY3NCA1Ny42NzQiIHN0eWxlPSJlbmFibGUtYmFja2dyb3VuZDpuZXcgMCAwIDU3LjY3NCA1Ny42NzQ7IiB4bWw6c3BhY2U9InByZXNlcnZlIiB3aWR0aD0iMTZweCIgaGVpZ2h0PSIxNnB4Ij4KPGc+Cgk8Zz4KCQk8cGF0aCBkPSJNNTUuMzM4LDE4LjE4MmMxLjI5MSwwLDIuMzM2LTEuMDQ3LDIuMzM2LTIuMzM3VjcuMDEyYzAtMS4yOS0xLjA0NS0yLjMzNy0yLjMzNi0yLjMzN2gtOC44MzQgICAgYy0xLjI5MSwwLTIuMzM4LDEuMDQ3LTIuMzM4LDIuMzM3djIuMDhIMTMuNTA4VjcuMDEzYzAtMS4yOS0xLjA0Ni0yLjMzNy0yLjMzNy0yLjMzN0gyLjMzN0MxLjA0Niw0LjY3NiwwLDUuNzIzLDAsNy4wMTN2OC44MzMgICAgYzAsMS4yOSwxLjA0NiwyLjMzNywyLjMzNywyLjMzN2gyLjA4djIxLjMxSDIuMzM4Yy0xLjI5MSwwLTIuMzM3LDEuMDQ3LTIuMzM3LDIuMzM3djguODMzYzAsMS4yOTEsMS4wNDYsMi4zMzcsMi4zMzcsMi4zMzdoOC44MzQgICAgYzEuMjkxLDAsMi4zMzctMS4wNDcsMi4zMzctMi4zMzd2LTIuMDhoMzAuNjU3djIuMDhjMCwxLjI5MSwxLjA0NiwyLjMzNywyLjMzNywyLjMzN2g4LjgzM2MxLjI5MSwwLDIuMzM4LTEuMDQ3LDIuMzM4LTIuMzM3ICAgIHYtOC44MzNjMC0xLjI5MS0xLjA0Ny0yLjMzNy0yLjMzOC0yLjMzN2gtMi4wNzhWMTguMTgySDU1LjMzOHogTTQ4Ljg0MSw5LjM0OUg1M3Y0LjE1OGgtMi4wOGgtMi4wNzl2LTIuMDc4ICAgIEM0OC44NDEsMTEuNDI5LDQ4Ljg0MSw5LjM0OSw0OC44NDEsOS4zNDl6IE00LjY3NCw5LjM1MWg0LjE2djIuMDc4djIuMDhoLTIuMDhoLTIuMDhWOS4zNTF6IE04LjgzNCw0OC4zMjZINC42NzV2LTQuMTU5aDIuMDc5ICAgIGgyLjA4djIuMDc5VjQ4LjMyNnogTTUzLDQ4LjMyNmgtNC4xNnYtMi4wOHYtMi4wNzloMi4wOEg1M0M1Myw0NC4xNjcsNTMsNDguMzI2LDUzLDQ4LjMyNnogTTQ4LjU4MywzOS40OTNoLTIuMDggICAgYy0xLjI5MSwwLTIuMzM3LDEuMDQ3LTIuMzM3LDIuMzM3djIuMDc4SDEzLjUwOVY0MS44M2MwLTEuMjkxLTEuMDQ2LTIuMzM3LTIuMzM3LTIuMzM3aC0yLjA4di0yMS4zMWgyLjA3OSAgICBjMS4yOTEsMCwyLjMzNy0xLjA0NywyLjMzNy0yLjMzN3YtMi4wOGgzMC42NTh2Mi4wNzljMCwxLjI5LDEuMDQ3LDIuMzM3LDIuMzM4LDIuMzM3aDIuMDc5ICAgIEM0OC41ODMsMTguMTgyLDQ4LjU4MywzOS40OTMsNDguNTgzLDM5LjQ5M3oiIGZpbGw9IiNGRkZGRkYiLz4KCTwvZz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8L3N2Zz4K"
        var scissorsButton_base64 = "data:image/svg+xml;utf8;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iaXNvLTg4NTktMSI/Pgo8IS0tIEdlbmVyYXRvcjogQWRvYmUgSWxsdXN0cmF0b3IgMTkuMC4wLCBTVkcgRXhwb3J0IFBsdWctSW4gLiBTVkcgVmVyc2lvbjogNi4wMCBCdWlsZCAwKSAgLS0+CjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgdmVyc2lvbj0iMS4xIiBpZD0iTGF5ZXJfMSIgeD0iMHB4IiB5PSIwcHgiIHZpZXdCb3g9IjAgMCA0NTEuNjc0IDQ1MS42NzQiIHN0eWxlPSJlbmFibGUtYmFja2dyb3VuZDpuZXcgMCAwIDQ1MS42NzQgNDUxLjY3NDsiIHhtbDpzcGFjZT0icHJlc2VydmUiIHdpZHRoPSIxNnB4IiBoZWlnaHQ9IjE2cHgiPgo8Zz4KCTxwYXRoIGQ9Ik0xNjcuODU0LDI5My4yOTljLTcuMTA0LTYuODM0LTE1LjQzLTEyLjYzMi0yNC44NS0xNy4wMjVjLTEyLjI5Mi01LjczMS0yNS4zNTYtOC42MzgtMzguODMtOC42MzggICBjLTM1LjYzLDAtNjguMzc4LDIwLjg1Ny04My40MzEsNTMuMTM4Yy0xMC4zODUsMjIuMjcxLTExLjQ3Niw0Ny4yNTUtMy4wNzEsNzAuMzQ3czI1LjI5OSw0MS41MjksNDcuNTcxLDUxLjkxNCAgIGMxMi4yOSw1LjczLDI1LjM1NCw4LjYzNywzOC44Myw4LjYzOWMzNS42MzEsMCw2OC4zNzktMjAuODU5LDgzLjQzMS01My4xMzhjMC0wLjAwMSwyMS4wMDMtMzYuMjkzLDIxLjAwMy0zNi4yOTNsLTQwLjI3Ni02OS41OTYgICBMMTY3Ljg1NCwyOTMuMjk5eiBNMTYwLjMxMywzODUuODU4Yy0xMC4xNDYsMjEuNzU3LTMyLjIxOCwzNS44MTUtNTYuMjM0LDM1LjgxNWMtOS4wNjktMC4wMDEtMTcuODY4LTEuOTYyLTI2LjE1OS01LjgyOCAgIGMtMTUuMDA5LTYuOTk5LTI2LjM5NC0xOS40MjMtMzIuMDU4LTM0Ljk4NXMtNC45MjktMzIuMzk4LDIuMDctNDcuNDA4YzEwLjE0Ni0yMS43NTcsMzIuMjIyLTM1LjgxNSw1Ni4yNDItMzUuODE1ICAgYzkuMDYxLDAsMTcuODU5LDEuOTYxLDI2LjE1MSw1LjgyN0MxNjEuMzA4LDMxNy45MTIsMTc0Ljc2MSwzNTQuODc0LDE2MC4zMTMsMzg1Ljg1OHoiIGZpbGw9IiNGRkZGRkYiLz4KCTxwYXRoIGQ9Ik0zNjIuODA0LDk1LjYyMmMxOS4zMy0zMy40OCw3Ljg1OS03Ni4yOTItMjUuNjIyLTk1LjYyMmwtOTQuMDI1LDE2Mi44NjRsNDAuMzE4LDY5LjgzNkwzNjIuODA0LDk1LjYyMnoiIGZpbGw9IiNGRkZGRkYiLz4KCTxwYXRoIGQ9Ik00MzAuOTMyLDMyMC43NzNjLTE1LjA1My0zMi4yNzktNDcuODAxLTUzLjEzNy04My40MzEtNTMuMTM3Yy0xMy40NzQsMC0yNi41MzgsMi45MDYtMzguODMsOC42MzggICBjLTkuNDIsNC4zOTMtMTcuNzQ3LDEwLjE5LTI0Ljg1LDE3LjAyNUwxMTQuNDkyLDBDODEuMDExLDE5LjMzLDY5LjU0LDYyLjE0MSw4OC44Nyw5NS42MjJsMTc1LjI5OSwzMDIuOTEgICBjMTUuMDU1LDMyLjI4NCw0Ny44MDMsNTMuMTQyLDgzLjQzMiw1My4xNDJjMTMuNDc1LDAsMjYuNTM5LTIuOTA3LDM4LjgzMS04LjYzOWMyMi4yNzEtMTAuMzg1LDM5LjE2Ni0yOC44MjIsNDcuNTcxLTUxLjkxNCAgIFM0NDEuMzE3LDM0My4wNDYsNDMwLjkzMiwzMjAuNzczeiBNNDA1LjgxMiwzODAuODZjLTUuNjY0LDE1LjU2My0xNy4wNDksMjcuOTg2LTMyLjA1OSwzNC45ODUgICBjLTguMjkyLDMuODY3LTE3LjA5MSw1LjgyOC0yNi4xNTIsNS44MjhjLTI0LjAyLDAtNDYuMDk1LTE0LjA1OS01Ni4yNDEtMzUuODE1Yy0xNC40NDgtMzAuOTg0LTAuOTk1LTY3Ljk0NiwyOS45ODgtODIuMzk1ICAgYzguMjkyLTMuODY2LDE3LjA5MS01LjgyNywyNi4xNTItNS44MjdjMjQuMDIsMCw0Ni4wOTYsMTQuMDU5LDU2LjI0MiwzNS44MTVDNDEwLjc0MSwzNDguNDYyLDQxMS40NzYsMzY1LjI5OCw0MDUuODEyLDM4MC44NnoiIGZpbGw9IiNGRkZGRkYiLz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8L3N2Zz4K"

        var selectionButtonIconWidth = 16;
        var scissorsButtonIconWidth = 16;

        // brush selection button
        topBarSVG.append("rect")
            .attr("class", "selectionButton")
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", smallButtonWidth)
            .attr("height", config.topBarHeight)
            .attr("rx", 10)
            .attr("ry", 10)
            .attr("fill", config.topBarColour)
            .on("mouseover", function() {
                // if this button is not selected
                if (d3.selectAll(".brushButtonSelected")[0].length == 0) {
                    d3.select(this).attr("fill", config.topBarHighlight);
                }
            })
            .on("mouseout", function() {
                // if this button is not selected
                if (d3.selectAll(".brushButtonSelected")[0].length == 0) {
                    d3.select(this).attr("fill", config.topBarColour);
                }
            })
            .on("click", function() {
                // if scissors button is selected, turn off scissors
                if (d3.selectAll(".scissorsButtonSelected")[0].length == 1) {
                    _pushScissorsButton(vizObj);
                }
                // push selection button function
                _pushBrushSelectionButton(brush, vizObj, cnvSVG);
            });
        topBarSVG.append("image")
            .attr("xlink:href", selectionButton_base64)
            .attr("x", smallButtonWidth/2 - (selectionButtonIconWidth/2))
            .attr("y", 7)
            .attr("width", selectionButtonIconWidth)
            .attr("height", selectionButtonIconWidth)
            .on("mouseover", function() {
                // if this button is not selected
                if (d3.selectAll(".brushButtonSelected")[0].length == 0) {
                    d3.select(".selectionButton").attr("fill", config.topBarHighlight);
                }
            })
            .on("mouseout", function() {
                // if this button is not selected
                if (d3.selectAll(".brushButtonSelected")[0].length == 0) {
                    d3.select(".selectionButton").attr("fill", config.topBarColour);
                }
            })
            .on("click", function() {
                // if scissors button is selected, turn off scissors
                if (d3.selectAll(".scissorsButtonSelected")[0].length == 1) {
                    _pushScissorsButton(vizObj);
                }
                // push selection button function
                _pushBrushSelectionButton(brush, vizObj, cnvSVG);
            });

        // scissors button
        topBarSVG.append("rect")
            .attr("class", "scissorsButton")
            .attr("x", smallButtonWidth)
            .attr("y", 0)
            .attr("width", smallButtonWidth)
            .attr("height", config.topBarHeight)
            .attr("rx", 10)
            .attr("ry", 10)
            .attr("fill", config.topBarColour)
            .on("mouseover", function() {
                // if this button is not selected
                if (d3.selectAll(".scissorsButtonSelected")[0].length == 0) {
                    d3.select(this).attr("fill", config.topBarHighlight);
                }
            })
            .on("mouseout", function() {
                // if this button is not selected
                if (d3.selectAll(".scissorsButtonSelected")[0].length == 0) {
                    d3.select(this).attr("fill", config.topBarColour);
                }
            })
            .on("click", function() {
                // if brush selection button is selected, turn it off
                if (d3.selectAll(".brushButtonSelected")[0].length == 1) {
                    _pushBrushSelectionButton(brush, vizObj, cnvSVG);
                }
                // push scissors button function
                _pushScissorsButton(vizObj);
            });
        topBarSVG.append("image")
            .attr("xlink:href", scissorsButton_base64)
            .attr("x", smallButtonWidth*3/2 - (scissorsButtonIconWidth/2))
            .attr("y", 7)
            .attr("width", scissorsButtonIconWidth)
            .attr("height", scissorsButtonIconWidth)
            .on("mouseover", function() {
                // if this button is not selected
                if (d3.selectAll(".scissorsButtonSelected")[0].length == 0) {
                    d3.select(".scissorsButton").attr("fill", config.topBarHighlight);
                }
            })
            .on("mouseout", function() {
                // if this button is not selected
                if (d3.selectAll(".scissorsButtonSelected")[0].length == 0) {
                    d3.select(".scissorsButton").attr("fill", config.topBarColour);
                }
            })
            .on("click", function() {
                // if brush selection button is selected, turn it off
                if (d3.selectAll(".brushButtonSelected")[0].length == 1) {
                    _pushBrushSelectionButton(brush, vizObj, cnvSVG);
                }
                // push scissors button function
                _pushScissorsButton(vizObj);
            });

        // FORCE FUNCTION

        var force = d3.layout.force()
            .size([config.treeWidth, config.treeHeight])
            .linkDistance(20)
            .gravity(.09)
            .charge(-20)
            .nodes(vizObj.userConfig.tree_nodes)
            .links(vizObj.userConfig.tree_edges)
            .start();

        // TOOLTIP FUNCTIONS

        var nodeTip = d3.tip()
            .attr('class', 'd3-tip')
            .offset([-10, 0])
            .html(function(d) {
                return "<strong>Cell:</strong> <span style='color:white'>" + d.name + "</span>";
            });
        treeSVG.call(nodeTip);

        var indicatorTip = d3.tip()
            .attr('class', 'd3-tip')
            .offset([-10, 0])
            .html(function(d) {
                return "<strong>Cell:</strong> <span style='color:white'>" + d + "</span>";
            });
        indicatorSVG.call(indicatorTip);

        // PLOT NODES AND EDGES

        var link = treeSVG
            .append("g")
            .classed("links", true)
            .selectAll(".link")
            .data(vizObj.userConfig.tree_edges)
            .enter().append("line")
            .classed("link", true)
            .attr("id", function(d) { 
                return d.link_id; 
            })
            .style("stroke",vizObj.generalConfig.defaultLinkColour)
            .attr("stroke-width", "2px")
            .on("mouseover", function(d) {
                // if there's no node or link selection taking place
                if (_checkForSelections()) {
                    // highlight downstream links
                    _downstreamEffects(vizObj, d.link_id);                     
                }
                // if scissors button is selected
                else if (d3.selectAll(".scissorsButtonSelected")[0].length == 1) {

                    // reset lists of selected links and scs
                    vizObj.view.selectedSCs = [];
                    vizObj.view.selectedLinks = [];

                    // highlight downstream links
                    _downstreamEffects(vizObj, d.link_id); 

                    // highlight the potentially-cut link red
                    d3.select("#"+d.link_id)
                        .style("stroke", "red");
                }
            })
            .on("mouseout", function(d) { 
                // if there's no node or link selection taking place, or scissors tool on, reset the links
                if (_checkForSelections() || d3.selectAll(".scissorsButtonSelected")[0].length == 1) {
                    _linkMouseout(vizObj, true); 
                }
            })
            .on("click", function(d) {
                // if scissors button is selected
                if (d3.selectAll(".scissorsButtonSelected")[0].length == 1) {

                    // for each link
                    vizObj.view.selectedLinks.forEach(function(link_id) {
                        // remove link
                        d3.select("#" + link_id).remove();

                        // remove link from list of links
                        var index = vizObj.userConfig.link_ids.indexOf(link_id);
                        vizObj.userConfig.link_ids.splice(index, 1);
                    })
                    // for each single cell
                    vizObj.view.selectedSCs.forEach(function(sc_id) {
                        d3.select("#node_" + sc_id).remove(); // remove node in tree
                        d3.select(".gridCellG.sc_" + sc_id).remove(); // remove copy number profile
                        d3.select(".groupAnnot.sc_" + sc_id).remove(); // remove group annotation
                        d3.select(".indic.sc_" + sc_id).remove(); // remove indicator

                        // remove single cell from list of single cells
                        var index = vizObj.userConfig.sc_ids_ordered.indexOf(sc_id);
                        vizObj.userConfig.sc_ids_ordered.splice(index, 1);
                    })

                    // adjust copy number matrix to fill the entire space
                    d3.timer(_updateTrimmedMatrix(vizObj), 300);
                }
            });

        // plot nodes
        var nodeG = treeSVG
            .append("g")
            .classed("nodes", true)
            .selectAll(".node")
            .data(vizObj.userConfig.tree_nodes)
            .enter()
            .append("g")
            .attr("class", "nodesG");

        // node circles
        var nodeCircle = nodeG.append("circle")
            .classed("node", true)
            .attr("id", function(d) {
                return "node_" + d.name;
            })
            .attr("r", function() {
                // if user wants to display node ids 
                if (vizObj.userConfig.display_node_ids) {
                    return config.tree_w_labels_r;
                }
                // don't display labels
                return config.tree_r
            })
            .style("fill", function(d) {
                // group annotations specified -- colour by group
                if (vizObj.view.groupsSpecified) {
                    var group = _.findWhere(vizObj.userConfig.sc_groups, {single_cell_id: d.name}).group;
                    return vizObj.view.colour_assignment[group];
                }
                // no group annotations -- default colour
                return config.defaultNodeColour;
            })
            .style("stroke", "#838181")
            .on('mouseover', function(d) {
                // if there's no node or link selection taking place
                if (_checkForSelections()) {
                    // show tooltip
                    nodeTip.show(d);

                    // highlight node
                    _highlightNode(d.name, vizObj);

                    // highlight indicator
                    _highlightIndicator(d.name, vizObj);
                }
            })
            .on('mouseout', function(d) {
                // if there's no node or link selection taking place
                if (_checkForSelections()) {
                    // hide tooltip
                    nodeTip.hide(d);

                    // reset node
                    _resetNode(d.name, vizObj);

                    // reset indicator
                    _resetIndicator(d.name);
                }
            })
            .call(force.drag);

        // node single cell labels (if user wants to display them)
        if (vizObj.userConfig.display_node_ids) {

            var nodeLabel = nodeG.append("text")
                .text(function(d) { return parseInt(d.name, 10); })
                .attr("font-size", 
                    _getLabelFontSize(_.pluck(vizObj.userConfig.tree_nodes, "name"), config.tree_w_labels_r * 2))
                .attr("text-anchor", "middle")
                .attr("dy", "+0.35em");
        }

        force.on("tick", function() {

            // radius of nodes
            var r = (vizObj.userConfig.display_node_ids) ? config.tree_r : config.tree_w_labels_r;

            nodeCircle.attr("cx", function(d) { 
                    return d.x = Math.max(r, Math.min(config.treeWidth - r, d.x)); 
                })
                .attr("cy", function(d) { 
                    return d.y = Math.max(r, Math.min(config.treeHeight - r, d.y)); 
                });

            if (vizObj.userConfig.display_node_ids) {
                nodeLabel.attr("x", function(d) { 
                        return d.x = Math.max(r, Math.min(config.treeWidth - r, d.x)); 
                    })
                    .attr("y", function(d) { 
                        return d.y = Math.max(r, Math.min(config.treeHeight - r, d.y)); 
                    });
            }

            link.attr("x1", function(d) { return d.source.x; })
                .attr("y1", function(d) { return d.source.y; })
                .attr("x2", function(d) { return d.target.x; })
                .attr("y2", function(d) { return d.target.y; });



        });

        // PLOT CNV 

        var gridCellsG = cnvSVG
            .append("g")
            .classed("gridCells", true)

        // for each single cell
        for (var i = 0; i < vizObj.userConfig.sc_ids_ordered.length; i++) {
            var cur_sc = vizObj.userConfig.sc_ids_ordered[i];
            var cur_data = vizObj.userConfig.pixel_info[[cur_sc]]; 
               
            gridCellsG
                .append("g")
                .attr("class", "gridCellG sc_" + cur_sc)
                .selectAll(".gridCell.sc_" + cur_sc)
                .data(cur_data)
                .enter()
                .append("rect")
                .attr("class", function(d) {
                    // group annotation
                    var group = (vizObj.view.groupsSpecified) ?
                        _.findWhere(vizObj.userConfig.sc_groups, {single_cell_id: d.sc_id}).group : "none";
                    return "gridCell sc_" + d.sc_id + " group_" + group;
                })
                .attr("x", function(d) { return d.px; })
                .attr("y", function(d) { 
                    d.sc_index = vizObj.userConfig.sc_ids_ordered.indexOf(d.sc_id);
                    d.y = (d.sc_index/vizObj.view.cnv.nrows)*(config.cnvHeight-config.chromLegendHeight);
                    return d.y; 
                })
                .attr("height", vizObj.view.cnv.rowHeight)
                .attr("width", function(d) { return d.px_width; })
                .attr("fill", function(d) { 
                    // no cnv data
                    if (typeof(d.mode_cnv) == "undefined") {
                        return "white";
                    }
                    // cnv data, but above max cnv value
                    else if (d.mode_cnv > maxCNV) {
                        return colorScale(maxCNV);
                    }
                    // regular cnv data
                    return colorScale(d.mode_cnv);
                })
                .on("mouseover", function(d) {
                    if (_checkForSelections()) {
                        // show indicator tooltip & highlight indicator
                        indicatorTip.show(d.sc_id, d3.select(".indic.sc_" + d.sc_id).node());
                        _highlightIndicator(d.sc_id, vizObj);

                        // highlight node
                        _highlightNode(d.sc_id, vizObj);
                    }
                })
                .on("mouseout", function(d) {
                    if (_checkForSelections()) {
                        // hide indicator tooltip & unhighlight indicator
                        indicatorTip.hide(d.sc_id);
                        _resetIndicator(d.sc_id);

                        // reset node
                        _resetNode(d.sc_id, vizObj);
                    }
                });

        }

        // PLOT CHROMOSOME LEGEND
        var chromBoxes = cnvSVG
            .append("g")
            .classed("chromLegend", true)
            .selectAll(".chromBoxG")
            .data(vizObj.userConfig.chrom_boxes)
            .enter().append("g")
            .attr("class", "chromBoxG")

        var nextColour = "#FFFFFF";
        chromBoxes.append("rect")
            .attr("class", function(d) { return "chromBox chr" + d.chr; })
            .attr("x", function(d) { return d.x; })
            .attr("y", config.cnvHeight-config.chromLegendHeight)
            .attr("height", config.chromLegendHeight)
            .attr("width", function(d) { return d.width; })
            .style("fill", function(d) { 
                if (nextColour == "#FFFFFF")
                    nextColour = "#F7F7F7";
                else
                    nextColour = "#FFFFFF";
                return nextColour;
            })

        chromBoxes.append("text")
            .attr("class", function(d) { return "chromBoxText chr" + d.chr; })
            .attr("x", function(d) { return d.x + (d.width / 2); })
            .attr("y", config.cnvHeight - (config.chromLegendHeight / 2))
            .attr("dy", ".35em")
            .attr("text-anchor", "middle")
            .attr("font-family", "sans-serif")
            .text(function(d) { return d.chr; })
            .attr("font-size", "8px");

        // PLOT INDICATOR RECTANGLES

        var indicators = indicatorSVG
            .append("g")
            .classed("indicators", true)
            .selectAll(".indic")
            .data(vizObj.userConfig.sc_ids_ordered)
            .enter()
            .append("rect")
            .attr("class", function(d) {
                return "indic sc_" + d;
            })
            .attr("x", 0)
            .attr("y", function(d) { 
                var index = vizObj.userConfig.sc_ids_ordered.indexOf(d);
                return (index/vizObj.view.cnv.nrows)*(config.cnvHeight-config.chromLegendHeight); 
            })
            .attr("height", vizObj.view.cnv.rowHeight)
            .attr("width", config.indicatorWidth)
            .attr("fill", config.highlightColour)
            .attr("fill-opacity", 0)
            .attr("stroke", "none");
        
        // PLOT GROUP ANNOTATION COLUMN

        if (vizObj.view.groupsSpecified) {
            var groupAnnot = groupAnnotSVG
                .append("g")
                .classed("groupAnnotG", true)
                .selectAll(".groupAnnot")
                .data(vizObj.userConfig.sc_groups)
                .enter()
                .append("rect")
                .attr("class", function(d) {
                    return "groupAnnot group_" + d.group + " sc_" + d.single_cell_id;
                })
                .attr("x", 0)
                .attr("y", function(d) { 
                    var index = vizObj.userConfig.sc_ids_ordered.indexOf(d.single_cell_id);
                    d.y = (index/vizObj.view.cnv.nrows)*(config.cnvHeight-config.chromLegendHeight)
                    return d.y; 
                })
                .attr("height", vizObj.view.cnv.rowHeight)
                .attr("width", config.groupAnnotWidth-3)
                .attr("fill", function(d) {
                    return vizObj.view.colour_assignment[d.group];
                })
                .attr("stroke", "none")
                .on("mouseover", function(d) {
                    if (_checkForSelections()) {
                        // highlight indicator & node for all sc's with this group annotation id,
                        // highlight group annotation rectangle in legend
                        _mouseoverGroupAnnot(d.group, vizObj);
                    }
                })
                .on("mouseout", function(d) {
                    if (_checkForSelections()) {
                        // reset indicators, nodes, group annotation rectangles in legend
                        _mouseoutGroupAnnot(vizObj);
                    }
                });
        }

        // PLOT CNV LEGEND

        // CNV legend title
        cnvLegendSVG.append("text")
            .attr("x", 0)
            .attr("y", 0)
            .attr("dy", "+0.71em")
            .attr("font-family", "sans-serif")
            .attr("font-size", config.titleHeight)
            .text("CNV");

        // CNV legend rectangle / text group
        var cnvLegendG = cnvLegendSVG
            .selectAll(".cnvLegendG")
            .data(colorScale.domain())
            .enter()
            .append("g")
            .classed("cnvLegendG", true);

        // CNV legend rectangles
        cnvLegendG
            .append("rect")
            .attr("x", 0)
            .attr("y", function(d,i) {
                return config.titleHeight + config.spacing*2 + i*(config.rectHeight + config.spacing);
            })
            .attr("height", config.rectHeight)
            .attr("width", config.rectHeight)
            .attr("fill", function(d) {
                return colorScale(d);
            });

        // CNV legend text
        cnvLegendG
            .append("text")
            .attr("x", config.rectHeight + config.spacing)
            .attr("y", function(d,i) {
                return config.titleHeight + config.spacing*2 + i*(config.rectHeight + config.spacing) + 
                    (config.fontHeight/2);
            })
            .attr("dy", "+0.35em")
            .text(function(d) { 
                if (d==maxCNV) {
                    return ">=" + d;
                }
                return d; 
            })
            .attr("font-family", "sans-serif")
            .attr("font-size", config.fontHeight)
            .style("fill", "black");

        // GROUP ANNOTATION LEGEND
        if (vizObj.view.groupsSpecified) {

            // group annotation legend title
            cnvLegendSVG.append("text")
                .attr("x", 0)
                .attr("y", config.groupAnnotStart)
                .attr("dy", "+0.71em")
                .attr("font-family", "sans-serif")
                .attr("font-size", config.titleHeight)
                .text("Group");

            // group annotation legend rectangle / text group
            var groupAnnotLegendG = cnvLegendSVG
                .selectAll(".groupAnnotLegendG")
                .data(Object.keys(vizObj.data.groups))
                .enter()
                .append("g")
                .classed("groupAnnotLegendG", true);

            // group annotation legend rectangles
            groupAnnotLegendG
                .append("rect")
                .attr("class", function(d) { return "legendGroupRect group_" + d; })
                .attr("x", 0)
                .attr("y", function(d,i) {
                    return config.groupAnnotStart + config.titleHeight + config.spacing*2 + i*(config.rectHeight + config.spacing);
                })
                .attr("height", config.rectHeight)
                .attr("width", config.rectHeight)
                .attr("fill", function(d) {
                    return vizObj.view.colour_assignment[d];
                })
                .on("mouseover", function(d) {
                    if (_checkForSelections()) {
                        // highlight indicator & node for all sc's with this group annotation id,
                        // highlight group annotation rectangle in legend
                        _mouseoverGroupAnnot(d, vizObj);
                    }
                })
                .on("mouseout", function(d) {
                    if (_checkForSelections()) {
                        // reset indicators, nodes, group annotation rectangles in legend
                        _mouseoutGroupAnnot(vizObj);
                    }
                });

            // group annotation legend text
            groupAnnotLegendG
                .append("text")
                .attr("class", function(d) { return "legendGroupText group_" + d; })
                .attr("x", config.rectHeight + config.spacing)
                .attr("y", function(d,i) {
                    return config.groupAnnotStart + config.titleHeight + config.spacing*2 + i*(config.rectHeight + config.spacing) + (config.fontHeight/2);
                })
                .attr("dy", "+0.35em")
                .text(function(d) { return d; })
                .attr("font-family", "sans-serif")
                .attr("font-size", config.fontHeight)
                .attr("fill", "black")
                .on("mouseover", function(d) {
                    if (_checkForSelections()) {
                        // highlight indicator & node for all sc's with this group annotation id,
                        // highlight group annotation rectangle in legend
                        _mouseoverGroupAnnot(d, vizObj);
                    }
                })
                .on("mouseout", function(d) {
                    if (_checkForSelections()) {
                        // reset indicators, nodes, group annotation rectangles in legend
                        _mouseoutGroupAnnot(vizObj);
                    }
                });
        }

    },

    resize: function(el, width, height, instance) {

    }

});
