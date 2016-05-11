HTMLWidgets.widget({

    name: 'cnvTree',

    type: 'output',

    initialize: function(el, width, height) {

        // defaults
        var defaults = {
            // tree
            tree_r: 4, // tree node radius
            tree_w_labels_r: 7, // tree node radius when labels displayed within

            // indicator
            indicatorWidth: 7, // width of the selected single cell indicator

            // group annotations
            groupAnnotWidth: 10, // width of the selected single cell group annotation

            // colours
            defaultNodeColour: "#3458A5",
            highlightColour: "#000000",
            linkHighlightColour: "#000000",
            defaultLinkColour: "#B7B7B7",

            // chromosome legend
            chromLegendHeight: 15, // height of chromosome legend

            // heatmap and group legends
            heatmapLegendWidth: 50,
            groupAnnotStartY: 140, // starting y-pixel for group annotation legend
            heatmapLegendStartY: 1, // starting y-pixel for heatmap legend
            legendTitleHeight: 14, // height of legend titles
            rectHeight: 12, // rectangle in legend
            rectSpacing: 2, // spacing between legend rectangles
            legendLeftPadding: 5, // space between legend and heatmap
            legendFontHeight: 12,

            // top bar
            topBarHeight: 30, // height of top panel
            topBarColour: "#D9D9D9",
            topBarHighlight: "#C6C6C6",
            spaceBelowTopBar: 15, // amount of space (px) below the top bar

            // switch between graph/tree
            switchView: true,

            // general 
            width: width-15,
            height: height-15
        };

        // global variable curVizObj
        vizObj = {};
        var view_id = el.id;
        vizObj[view_id] = {};
        curVizObj = vizObj[view_id];
        curVizObj.data = {};
        curVizObj.view = {};
        curVizObj.view_id = view_id;

        // selected single cells list & selected links list
        curVizObj.view.selectedSCs = [];
        curVizObj.view.selectedLinks = [];

        // more configurations
        curVizObj.generalConfig = $.extend(true, {}, defaults);
        var config = curVizObj.generalConfig;

        // heatmap configurations
        config.hmHeight = config.height - config.topBarHeight - config.spaceBelowTopBar;
        config.cnvTop = 0;
        config.cnvBottom = (config.hmHeight-config.chromLegendHeight);

        // indicator configurations
        config.indicatorHeight = config.height - config.topBarHeight - config.spaceBelowTopBar;

        // group annotation configurations
        config.groupAnnotHeight = config.height - config.topBarHeight - config.spaceBelowTopBar;

        // heatmap legend configurations
        config.heatmapLegendHeight = config.height - config.topBarHeight - config.spaceBelowTopBar;

        // tree configurations
        config.treeHeight = config.height - config.topBarHeight - config.spaceBelowTopBar;

        return {}

    },

    renderValue: function(el, x, instance) {

        var view_id = el.id;
        var curVizObj = vizObj[view_id]; 
        var config = curVizObj.generalConfig;

        // GET PARAMS FROM R

        curVizObj.userConfig = x;
        curVizObj.view.groupsSpecified = (curVizObj.userConfig.sc_groups != null); // (T/F) group annotation is specified

        // UPDATE GENERAL PARAMS, GIVEN USER PARAMS

        // tree configurations
        config.treeWidth = config.width - config.indicatorWidth - config.heatmapLegendWidth - curVizObj.userConfig.heatmapWidth;

        // if group annotation specified, reduce the width of the tree
        if (curVizObj.view.groupsSpecified) {
            config.treeWidth -= config.groupAnnotWidth;
        }

        // if the type of data is cnv, reduce tree height to account for chromosome legend
        if (curVizObj.userConfig.heatmap_type == "cnv") {
            config.treeHeight -= config.chromLegendHeight;
        }

        // GET TREE CONTENT

        // if the user hasn't specified a custom single cell id order for the cnv heatmap, order by tree
        if (!curVizObj.userConfig.hm_sc_ids_ordered) {
            var nodeOrder = _getNodeOrder(curVizObj.userConfig.link_ids, curVizObj.userConfig.root, []);
            curVizObj.userConfig.hm_sc_ids_ordered = nodeOrder;
        }

        // for plotting the heatmap, remove single cell ids that are in the tree but not the heatmap
        for (var i = 0; i < curVizObj.userConfig.scs_missing_from_hm.length; i++) {
            var cur_sc_missing = curVizObj.userConfig.scs_missing_from_hm[i];
            var index = curVizObj.userConfig.hm_sc_ids_ordered.indexOf(cur_sc_missing);
            curVizObj.userConfig.hm_sc_ids_ordered.splice(index, 1);
        }

        // keep track of original list of scs, for tree pruning purposes
        curVizObj.view.original_sc_list = $.extend([], curVizObj.userConfig.hm_sc_ids_ordered);

        // get tree structures for each node
        curVizObj.data.treeStructures = _getTreeStructures(curVizObj.userConfig.tree_edges);
        
        // the root tree structure
        curVizObj.data.treeStructure = 
            _.findWhere(curVizObj.data.treeStructures, {sc_id: curVizObj.userConfig.root});

        // get descendants for each node
        curVizObj.data.treeDescendantsArr = {};
        curVizObj.userConfig.tree_nodes.forEach(function(node, idx) {
            var curRoot = _.findWhere(curVizObj.data.treeStructures, {sc_id: node.sc_id});
            var curDescendants = _getDescendantIds(curRoot, []);
            curVizObj.data.treeDescendantsArr[node.sc_id] = curDescendants;
        })

        // get direct descendants for each node
        curVizObj.data.direct_descendants = _getDirectDescendants(curVizObj.data.treeStructure, {});

        // get ancestors for each node
        curVizObj.data.treeAncestorsArr = _getAncestorIds(curVizObj);

        // get the height of the tree (# nodes)
        curVizObj.data.tree_height = 0;
        Object.keys(curVizObj.data.treeAncestorsArr).forEach(function(key) {
            var ancestor_arr = curVizObj.data.treeAncestorsArr[key];
            if ((ancestor_arr.length + 1) > curVizObj.data.tree_height) {
                curVizObj.data.tree_height = (ancestor_arr.length + 1);
            }
        })

        // GET CNV CONTENT

        // cnv plot number of rows
        curVizObj.view.hm = {};
        curVizObj.view.hm.nrows = curVizObj.userConfig.hm_sc_ids_ordered.length;

        // height of each cnv row
        curVizObj.view.hm.rowHeight = (1/curVizObj.view.hm.nrows)*(config.hmHeight-config.chromLegendHeight);

        // get group annotation info as object w/property "group" : [array of single cells]
        if (curVizObj.view.groupsSpecified) {
            _reformatGroupAnnots(curVizObj);
        }

        // GET X- and Y-COORDINATE FOR EACH SINGLE CELL

        _getYCoordinates(curVizObj);
        _getXCoordinates(curVizObj);

        console.log("curVizObj");
        console.log(curVizObj);

        // COLOURS

        // CNV colour scale
        var maxCNV = 6;
        var cnvColorScale = d3.scale.ordinal() 
            .domain([0,1,2,3,4,5,6])
            .range(["#2e7aab", "#73a9d4", "#D6D5D5", "#fec28b", "#fd8b3a", "#ca632c", "#954c25"]);

        // targeted mutation colour scale
        var targeted_colours = ["#417EAA", "#F9F7BC", "#C63C4C"];
        var targetedColorScale = d3.scale.linear()  
            .domain([0, 0.5, 1])             
            .range(targeted_colours)

        // group annotation colours
        if (curVizObj.view.groupsSpecified) {
            curVizObj.view.colour_assignment = _getColours(_.uniq(_.pluck(curVizObj.userConfig.sc_groups, "group")));
        }

        // BRUSH SELECTION FUNCTION

        var brush = d3.svg.brush()
            .y(d3.scale.linear().domain([0, config.hmHeight]).range([0, config.hmHeight]))
            .on("brushstart", function() { d3.select(".cnvSVG").classed("brushed", true); })
            .on("brushend", function() {
                return _brushEnd(curVizObj, brush);
            });

        // CANVAS for PNG output
        
        var canvas = d3.select(el).append("canvas")
            .attr("height", config.hmHeight + "px")
            .attr("width", config.width + "px")
            .attr("style", "display:none");

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

        // CONTAINER DIV and SVG

        var containerDIV = d3.select(el)
            .append("div")
            .attr("class", "containerDIV")
            .style("width", config.width + "px")
            .style("height", config.hmHeight + "px")
            .style("float", "left")
            .attr("id", view_id);

        var containerSVG = containerDIV
            .append("svg:svg")
            .attr("class", "containerSVG_" + view_id)
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", config.width)
            .attr("height", config.hmHeight);

        // TREE SVG

        curVizObj.view.treeSVG = containerSVG.append("g")  
            .attr("class", "treeSVG")     
            .attr("transform", "translate(" + 0 + "," + 0 + ")");

        // INDICATOR SVG

        curVizObj.view.indicatorSVG = containerSVG.append("g")
            .attr("class", "indicatorSVG")
            .attr("transform", "translate(" + config.treeWidth + "," + 0 + ")");

        // GROUP ANNOTATION SVG

        if (curVizObj.view.groupsSpecified) {
            curVizObj.view.groupAnnotSVG = containerSVG.append("g")
                .attr("class", "groupAnnotSVG")
                .attr("transform", "translate(" + (config.treeWidth + config.indicatorWidth) + "," + 0 + ")");
        }

        // CNV SVG

        curVizObj.view.cnvSVG = containerSVG.append("g")
            .attr("class", "cnvSVG")
            .attr("transform", function() {
                var t_x = (curVizObj.view.groupsSpecified) ? 
                    (config.treeWidth + config.indicatorWidth + config.groupAnnotWidth) :
                    (config.treeWidth + config.indicatorWidth);
                return "translate(" + t_x + "," + 0 + ")"
            });

        // CNV LEGEND SVG

        curVizObj.view.cnvLegendSVG = containerSVG.append("g")
            .attr("class", "cnvLegendSVG")
            .attr("transform", function() {
                var t_x = (curVizObj.view.groupsSpecified) ? 
                    (config.treeWidth + config.indicatorWidth + config.groupAnnotWidth + curVizObj.userConfig.heatmapWidth) :
                    (config.treeWidth + config.indicatorWidth + curVizObj.userConfig.heatmapWidth);
                return "translate(" + t_x + "," + 0 + ")"
            });

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

        // button widths
        var smallButtonWidth = 42; 
        var bigButtonWidth = 84;

        // base 64 for each icon
        var selectionButton_base64 = "data:image/svg+xml;utf8;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iaXNvLTg4NTktMSI/Pgo8IS0tIEdlbmVyYXRvcjogQWRvYmUgSWxsdXN0cmF0b3IgMTguMS4xLCBTVkcgRXhwb3J0IFBsdWctSW4gLiBTVkcgVmVyc2lvbjogNi4wMCBCdWlsZCAwKSAgLS0+CjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgdmVyc2lvbj0iMS4xIiBpZD0iQ2FwYV8xIiB4PSIwcHgiIHk9IjBweCIgdmlld0JveD0iMCAwIDU3LjY3NCA1Ny42NzQiIHN0eWxlPSJlbmFibGUtYmFja2dyb3VuZDpuZXcgMCAwIDU3LjY3NCA1Ny42NzQ7IiB4bWw6c3BhY2U9InByZXNlcnZlIiB3aWR0aD0iMTZweCIgaGVpZ2h0PSIxNnB4Ij4KPGc+Cgk8Zz4KCQk8cGF0aCBkPSJNNTUuMzM4LDE4LjE4MmMxLjI5MSwwLDIuMzM2LTEuMDQ3LDIuMzM2LTIuMzM3VjcuMDEyYzAtMS4yOS0xLjA0NS0yLjMzNy0yLjMzNi0yLjMzN2gtOC44MzQgICAgYy0xLjI5MSwwLTIuMzM4LDEuMDQ3LTIuMzM4LDIuMzM3djIuMDhIMTMuNTA4VjcuMDEzYzAtMS4yOS0xLjA0Ni0yLjMzNy0yLjMzNy0yLjMzN0gyLjMzN0MxLjA0Niw0LjY3NiwwLDUuNzIzLDAsNy4wMTN2OC44MzMgICAgYzAsMS4yOSwxLjA0NiwyLjMzNywyLjMzNywyLjMzN2gyLjA4djIxLjMxSDIuMzM4Yy0xLjI5MSwwLTIuMzM3LDEuMDQ3LTIuMzM3LDIuMzM3djguODMzYzAsMS4yOTEsMS4wNDYsMi4zMzcsMi4zMzcsMi4zMzdoOC44MzQgICAgYzEuMjkxLDAsMi4zMzctMS4wNDcsMi4zMzctMi4zMzd2LTIuMDhoMzAuNjU3djIuMDhjMCwxLjI5MSwxLjA0NiwyLjMzNywyLjMzNywyLjMzN2g4LjgzM2MxLjI5MSwwLDIuMzM4LTEuMDQ3LDIuMzM4LTIuMzM3ICAgIHYtOC44MzNjMC0xLjI5MS0xLjA0Ny0yLjMzNy0yLjMzOC0yLjMzN2gtMi4wNzhWMTguMTgySDU1LjMzOHogTTQ4Ljg0MSw5LjM0OUg1M3Y0LjE1OGgtMi4wOGgtMi4wNzl2LTIuMDc4ICAgIEM0OC44NDEsMTEuNDI5LDQ4Ljg0MSw5LjM0OSw0OC44NDEsOS4zNDl6IE00LjY3NCw5LjM1MWg0LjE2djIuMDc4djIuMDhoLTIuMDhoLTIuMDhWOS4zNTF6IE04LjgzNCw0OC4zMjZINC42NzV2LTQuMTU5aDIuMDc5ICAgIGgyLjA4djIuMDc5VjQ4LjMyNnogTTUzLDQ4LjMyNmgtNC4xNnYtMi4wOHYtMi4wNzloMi4wOEg1M0M1Myw0NC4xNjcsNTMsNDguMzI2LDUzLDQ4LjMyNnogTTQ4LjU4MywzOS40OTNoLTIuMDggICAgYy0xLjI5MSwwLTIuMzM3LDEuMDQ3LTIuMzM3LDIuMzM3djIuMDc4SDEzLjUwOVY0MS44M2MwLTEuMjkxLTEuMDQ2LTIuMzM3LTIuMzM3LTIuMzM3aC0yLjA4di0yMS4zMWgyLjA3OSAgICBjMS4yOTEsMCwyLjMzNy0xLjA0NywyLjMzNy0yLjMzN3YtMi4wOGgzMC42NTh2Mi4wNzljMCwxLjI5LDEuMDQ3LDIuMzM3LDIuMzM4LDIuMzM3aDIuMDc5ICAgIEM0OC41ODMsMTguMTgyLDQ4LjU4MywzOS40OTMsNDguNTgzLDM5LjQ5M3oiIGZpbGw9IiNGRkZGRkYiLz4KCTwvZz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8L3N2Zz4K"
        var scissorsButton_base64 = "data:image/svg+xml;utf8;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iaXNvLTg4NTktMSI/Pgo8IS0tIEdlbmVyYXRvcjogQWRvYmUgSWxsdXN0cmF0b3IgMTkuMC4wLCBTVkcgRXhwb3J0IFBsdWctSW4gLiBTVkcgVmVyc2lvbjogNi4wMCBCdWlsZCAwKSAgLS0+CjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgdmVyc2lvbj0iMS4xIiBpZD0iTGF5ZXJfMSIgeD0iMHB4IiB5PSIwcHgiIHZpZXdCb3g9IjAgMCA0NTEuNjc0IDQ1MS42NzQiIHN0eWxlPSJlbmFibGUtYmFja2dyb3VuZDpuZXcgMCAwIDQ1MS42NzQgNDUxLjY3NDsiIHhtbDpzcGFjZT0icHJlc2VydmUiIHdpZHRoPSIxNnB4IiBoZWlnaHQ9IjE2cHgiPgo8Zz4KCTxwYXRoIGQ9Ik0xNjcuODU0LDI5My4yOTljLTcuMTA0LTYuODM0LTE1LjQzLTEyLjYzMi0yNC44NS0xNy4wMjVjLTEyLjI5Mi01LjczMS0yNS4zNTYtOC42MzgtMzguODMtOC42MzggICBjLTM1LjYzLDAtNjguMzc4LDIwLjg1Ny04My40MzEsNTMuMTM4Yy0xMC4zODUsMjIuMjcxLTExLjQ3Niw0Ny4yNTUtMy4wNzEsNzAuMzQ3czI1LjI5OSw0MS41MjksNDcuNTcxLDUxLjkxNCAgIGMxMi4yOSw1LjczLDI1LjM1NCw4LjYzNywzOC44Myw4LjYzOWMzNS42MzEsMCw2OC4zNzktMjAuODU5LDgzLjQzMS01My4xMzhjMC0wLjAwMSwyMS4wMDMtMzYuMjkzLDIxLjAwMy0zNi4yOTNsLTQwLjI3Ni02OS41OTYgICBMMTY3Ljg1NCwyOTMuMjk5eiBNMTYwLjMxMywzODUuODU4Yy0xMC4xNDYsMjEuNzU3LTMyLjIxOCwzNS44MTUtNTYuMjM0LDM1LjgxNWMtOS4wNjktMC4wMDEtMTcuODY4LTEuOTYyLTI2LjE1OS01LjgyOCAgIGMtMTUuMDA5LTYuOTk5LTI2LjM5NC0xOS40MjMtMzIuMDU4LTM0Ljk4NXMtNC45MjktMzIuMzk4LDIuMDctNDcuNDA4YzEwLjE0Ni0yMS43NTcsMzIuMjIyLTM1LjgxNSw1Ni4yNDItMzUuODE1ICAgYzkuMDYxLDAsMTcuODU5LDEuOTYxLDI2LjE1MSw1LjgyN0MxNjEuMzA4LDMxNy45MTIsMTc0Ljc2MSwzNTQuODc0LDE2MC4zMTMsMzg1Ljg1OHoiIGZpbGw9IiNGRkZGRkYiLz4KCTxwYXRoIGQ9Ik0zNjIuODA0LDk1LjYyMmMxOS4zMy0zMy40OCw3Ljg1OS03Ni4yOTItMjUuNjIyLTk1LjYyMmwtOTQuMDI1LDE2Mi44NjRsNDAuMzE4LDY5LjgzNkwzNjIuODA0LDk1LjYyMnoiIGZpbGw9IiNGRkZGRkYiLz4KCTxwYXRoIGQ9Ik00MzAuOTMyLDMyMC43NzNjLTE1LjA1My0zMi4yNzktNDcuODAxLTUzLjEzNy04My40MzEtNTMuMTM3Yy0xMy40NzQsMC0yNi41MzgsMi45MDYtMzguODMsOC42MzggICBjLTkuNDIsNC4zOTMtMTcuNzQ3LDEwLjE5LTI0Ljg1LDE3LjAyNUwxMTQuNDkyLDBDODEuMDExLDE5LjMzLDY5LjU0LDYyLjE0MSw4OC44Nyw5NS42MjJsMTc1LjI5OSwzMDIuOTEgICBjMTUuMDU1LDMyLjI4NCw0Ny44MDMsNTMuMTQyLDgzLjQzMiw1My4xNDJjMTMuNDc1LDAsMjYuNTM5LTIuOTA3LDM4LjgzMS04LjYzOWMyMi4yNzEtMTAuMzg1LDM5LjE2Ni0yOC44MjIsNDcuNTcxLTUxLjkxNCAgIFM0NDEuMzE3LDM0My4wNDYsNDMwLjkzMiwzMjAuNzczeiBNNDA1LjgxMiwzODAuODZjLTUuNjY0LDE1LjU2My0xNy4wNDksMjcuOTg2LTMyLjA1OSwzNC45ODUgICBjLTguMjkyLDMuODY3LTE3LjA5MSw1LjgyOC0yNi4xNTIsNS44MjhjLTI0LjAyLDAtNDYuMDk1LTE0LjA1OS01Ni4yNDEtMzUuODE1Yy0xNC40NDgtMzAuOTg0LTAuOTk1LTY3Ljk0NiwyOS45ODgtODIuMzk1ICAgYzguMjkyLTMuODY2LDE3LjA5MS01LjgyNywyNi4xNTItNS44MjdjMjQuMDIsMCw0Ni4wOTYsMTQuMDU5LDU2LjI0MiwzNS44MTVDNDEwLjc0MSwzNDguNDYyLDQxMS40NzYsMzY1LjI5OCw0MDUuODEyLDM4MC44NnoiIGZpbGw9IiNGRkZGRkYiLz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8L3N2Zz4K"
        var forceDirectedIcon_base64 = "data:image/svg+xml;utf8;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iaXNvLTg4NTktMSI/Pgo8IS0tIEdlbmVyYXRvcjogQWRvYmUgSWxsdXN0cmF0b3IgMTYuMC4wLCBTVkcgRXhwb3J0IFBsdWctSW4gLiBTVkcgVmVyc2lvbjogNi4wMCBCdWlsZCAwKSAgLS0+CjwhRE9DVFlQRSBzdmcgUFVCTElDICItLy9XM0MvL0RURCBTVkcgMS4xLy9FTiIgImh0dHA6Ly93d3cudzMub3JnL0dyYXBoaWNzL1NWRy8xLjEvRFREL3N2ZzExLmR0ZCI+CjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgdmVyc2lvbj0iMS4xIiBpZD0iQ2FwYV8xIiB4PSIwcHgiIHk9IjBweCIgd2lkdGg9IjUxMnB4IiBoZWlnaHQ9IjUxMnB4IiB2aWV3Qm94PSIwIDAgMzE0LjAxNCAzMTQuMDE1IiBzdHlsZT0iZW5hYmxlLWJhY2tncm91bmQ6bmV3IDAgMCAzMTQuMDE0IDMxNC4wMTU7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPGc+Cgk8ZyBpZD0iX3gzNF8yOC5fTmV0d29yayI+CgkJPGc+CgkJCTxwYXRoIGQ9Ik0yNjYuOTExLDEwOS44OThjLTIwLjQ5OCwwLTM3Ljg5NCwxMy4xMjUtNDQuMzU0LDMxLjQwOEgxMTYuNDA2bDUxLjczNC01MS43MzJjNi4xNDcsMi45MzYsMTMsNC42MzEsMjAuMjcsNC42MzEgICAgIGMyNi4wMDQsMCw0Ny4xMDQtMjEuMDk1LDQ3LjEwNC00Ny4xMDRDMjM1LjUxMywyMS4wODcsMjE0LjQxNCwwLDE4OC40MSwwYy0yNi4wMDUsMC00Ny4xMDQsMjEuMDg3LTQ3LjEwNCw0Ny4xMDIgICAgIGMwLDcuMjY4LDEuNjk1LDE0LjEyMiw0LjYzMSwyMC4yNjRsLTYxLjI3OCw2MS4yODhjLTguNTktMTEuMzgzLTIyLjIwMS0xOC43NDctMzcuNTU4LTE4Ljc0NyAgICAgQzIxLjA5MywxMDkuOTA2LDAsMTMwLjk5MSwwLDE1Ny4wMDdjMCwyNi4wMDQsMjEuMDkzLDQ3LjEwMyw0Ny4xMDEsNDcuMTAzYzE1LjM2NSwwLDI4Ljk2OC03LjM2MSwzNy41NTgtMTguNzU1bDYxLjI3OCw2MS4yODYgICAgIGMtMi45MzYsNi4xNTEtNC42MzEsMTMuMDA0LTQuNjMxLDIwLjI3YzAsMjYuMDA0LDIxLjA5OSw0Ny4xMDQsNDcuMTA0LDQ3LjEwNGMyNi4wMDQsMCw0Ny4xMDQtMjEuMSw0Ny4xMDQtNDcuMTA0ICAgICBjMC0yNi4wMTctMjEuMS00Ny4xLTQ3LjEwNC00Ny4xYy03LjI3LDAtMTQuMTIyLDEuNjkxLTIwLjI3LDQuNjI5bC01MS43MzQtNTEuNzMyaDEwNi4xNTEgICAgIGM2LjQ2OCwxOC4yODYsMjMuODU1LDMxLjQwMiw0NC4zNTQsMzEuNDAyYzI2LjAwOSwwLDQ3LjEwNC0yMS4wOTksNDcuMTA0LTQ3LjEwMyAgICAgQzMxNC4wMTQsMTMwLjk5MSwyOTIuOTE5LDEwOS44OTgsMjY2LjkxMSwxMDkuODk4eiBNMTg4LjQxLDMxLjQwMmM4LjY2NCwwLDE1LjcwMSw3LjAyNSwxNS43MDEsMTUuNjk5ICAgICBjMCw4LjY2OC03LjAzNywxNS43MDEtMTUuNzAxLDE1LjcwMXMtMTUuNzAxLTcuMDMzLTE1LjcwMS0xNS43MDFDMTcyLjcwOCwzOC40MjgsMTc5Ljc0NiwzMS40MDIsMTg4LjQxLDMxLjQwMnogTTQ3LjEwMiwxNzIuNzA4ICAgICBjLTguNjY2LDAtMTUuNjk5LTcuMDM3LTE1LjY5OS0xNS43MDFjMC04LjY3NCw3LjAzMy0xNS43MDEsMTUuNjk5LTE1LjcwMWM4LjY2OCwwLDE1LjcwMSw3LjAyNywxNS43MDEsMTUuNzAxICAgICBDNjIuODAzLDE2NS42NzEsNTUuNzcsMTcyLjcwOCw0Ny4xMDIsMTcyLjcwOHogTTE4OC40MSwyNTEuMjE0YzguNjY0LDAsMTUuNzAxLDcuMDIxLDE1LjcwMSwxNS42OTcgICAgIGMwLDguNjY0LTcuMDM3LDE1LjcwMS0xNS43MDEsMTUuNzAxcy0xNS43MDEtNy4wMzctMTUuNzAxLTE1LjcwMUMxNzIuNzA4LDI1OC4yMzQsMTc5Ljc0NiwyNTEuMjE0LDE4OC40MSwyNTEuMjE0eiAgICAgIE0yNjYuOTExLDE3Mi43MDhjLTguNjYsMC0xNS42OTctNy4wMzctMTUuNjk3LTE1LjcwMWMwLTguNjc0LDcuMDM3LTE1LjcwMSwxNS42OTctMTUuNzAxYzguNjY0LDAsMTUuNzAxLDcuMDI3LDE1LjcwMSwxNS43MDEgICAgIEMyODIuNjEyLDE2NS42NzEsMjc1LjU3NSwxNzIuNzA4LDI2Ni45MTEsMTcyLjcwOHoiIGZpbGw9IiNGRkZGRkYiLz4KCQk8L2c+Cgk8L2c+CjwvZz4KPGc+CjwvZz4KPGc+CjwvZz4KPGc+CjwvZz4KPGc+CjwvZz4KPGc+CjwvZz4KPGc+CjwvZz4KPGc+CjwvZz4KPGc+CjwvZz4KPGc+CjwvZz4KPGc+CjwvZz4KPGc+CjwvZz4KPGc+CjwvZz4KPGc+CjwvZz4KPGc+CjwvZz4KPGc+CjwvZz4KPC9zdmc+Cg=="
        var phylogenyIcon_base64 = "data:image/svg+xml;utf8;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iaXNvLTg4NTktMSI/Pgo8IS0tIEdlbmVyYXRvcjogQWRvYmUgSWxsdXN0cmF0b3IgMTYuMC4wLCBTVkcgRXhwb3J0IFBsdWctSW4gLiBTVkcgVmVyc2lvbjogNi4wMCBCdWlsZCAwKSAgLS0+CjwhRE9DVFlQRSBzdmcgUFVCTElDICItLy9XM0MvL0RURCBTVkcgMS4xLy9FTiIgImh0dHA6Ly93d3cudzMub3JnL0dyYXBoaWNzL1NWRy8xLjEvRFREL3N2ZzExLmR0ZCI+CjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgdmVyc2lvbj0iMS4xIiBpZD0iQ2FwYV8xIiB4PSIwcHgiIHk9IjBweCIgd2lkdGg9IjUxMnB4IiBoZWlnaHQ9IjUxMnB4IiB2aWV3Qm94PSIwIDAgMzE0LjAxNCAzMTQuMDE1IiBzdHlsZT0iZW5hYmxlLWJhY2tncm91bmQ6bmV3IDAgMCAzMTQuMDE0IDMxNC4wMTU7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPGc+Cgk8ZyBpZD0iX3gzNF8yOS5fTmV0d29yayI+CgkJPGc+CgkJCTxwYXRoIGQ9Ik0yODIuNjEyLDIyMi41NTd2LTQ5Ljg0OWMwLTE3LjM0Mi0xNC4wNTgtMzEuNDAyLTMxLjM5OC0zMS40MDJoLTc4LjUwNVY5MS40NjQgICAgIGMxOC4yODYtNi40NzQsMzEuNDAyLTIzLjg2NiwzMS40MDItNDQuMzY4YzAtMjYuMDA4LTIxLjEtNDcuMDk2LTQ3LjEwNC00Ny4wOTZjLTI2LjAwOCwwLTQ3LjEwMiwyMS4wODctNDcuMTAyLDQ3LjA5NiAgICAgYzAsMjAuNTAyLDEzLjExNywzNy44OTQsMzEuNCw0NC4zNjh2NDkuODQySDYyLjgwM2MtMTcuMzQsMC0zMS40LDE0LjA2LTMxLjQsMzEuNDAydjQ5Ljg0OUMxMy4xMTcsMjI5LjAxNywwLDI0Ni40MTMsMCwyNjYuOTExICAgICBjMCwyNi4wMDQsMjEuMDkzLDQ3LjEwNCw0Ny4xMDEsNDcuMTA0czQ3LjEwMy0yMS4xLDQ3LjEwMy00Ny4xMDRjMC0yMC40OTgtMTMuMTE4LTM3Ljg5NS0zMS40MDItNDQuMzU0di00OS44NDloNzguNTAzdjQ5Ljg0OSAgICAgYy0xOC4yODQsNi40Ni0zMS40LDIzLjg1Ni0zMS40LDQ0LjM1NGMwLDI2LjAwNCwyMS4wOTMsNDcuMTA0LDQ3LjEwMiw0Ny4xMDRjMjYuMDA0LDAsNDcuMTA0LTIxLjEsNDcuMTA0LTQ3LjEwNCAgICAgYzAtMjAuNDk4LTEzLjExNi0zNy44OTUtMzEuNDAyLTQ0LjM1NHYtNDkuODQ5aDc4LjUwNXY0OS44NDljLTE4LjI4NSw2LjQ2LTMxLjQwMSwyMy44NTYtMzEuNDAxLDQ0LjM1NCAgICAgYzAsMjYuMDA0LDIxLjA5NSw0Ny4xMDQsNDcuMDk5LDQ3LjEwNGMyNi4wMDksMCw0Ny4xMDQtMjEuMSw0Ny4xMDQtNDcuMTA0QzMxNC4wMTQsMjQ2LjQxMywzMDAuODk4LDIyOS4wMTcsMjgyLjYxMiwyMjIuNTU3eiAgICAgIE00Ny4xMDIsMjgyLjYxMmMtOC42NjYsMC0xNS42OTktNy4wMzctMTUuNjk5LTE1LjcwMWMwLTguNjc3LDcuMDMzLTE1LjY5NywxNS42OTktMTUuNjk3YzguNjY4LDAsMTUuNzAxLDcuMDIxLDE1LjcwMSwxNS42OTcgICAgIEM2Mi44MDMsMjc1LjU3NSw1NS43NywyODIuNjEyLDQ3LjEwMiwyODIuNjEyeiBNMTU3LjAwNywyODIuNjEyYy04LjY2NiwwLTE1LjcwMS03LjAzNy0xNS43MDEtMTUuNzAxICAgICBjMC04LjY3Nyw3LjAzNS0xNS42OTcsMTUuNzAxLTE1LjY5N2M4LjY2NCwwLDE1LjcwMSw3LjAyMSwxNS43MDEsMTUuNjk3QzE3Mi43MDgsMjc1LjU3NSwxNjUuNjcxLDI4Mi42MTIsMTU3LjAwNywyODIuNjEyeiAgICAgIE0xNTcuMDA3LDYyLjgwM2MtOC42NjYsMC0xNS43MDEtNy4wMzMtMTUuNzAxLTE1LjcwN2MwLTguNjc2LDcuMDM1LTE1LjY5MywxNS43MDEtMTUuNjkzYzguNjY0LDAsMTUuNzAxLDcuMDI1LDE1LjcwMSwxNS42OTMgICAgIEMxNzIuNzA4LDU1Ljc2MiwxNjUuNjcxLDYyLjgwMywxNTcuMDA3LDYyLjgwM3ogTTI2Ni45MTEsMjgyLjYxMmMtOC42NiwwLTE1LjY5Ny03LjAzNy0xNS42OTctMTUuNzAxICAgICBjMC04LjY3Nyw3LjAzNy0xNS42OTcsMTUuNjk3LTE1LjY5N2M4LjY2NCwwLDE1LjcwMSw3LjAyMSwxNS43MDEsMTUuNjk3QzI4Mi42MTIsMjc1LjU3NSwyNzUuNTc1LDI4Mi42MTIsMjY2LjkxMSwyODIuNjEyeiIgZmlsbD0iI0ZGRkZGRiIvPgoJCTwvZz4KCTwvZz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8L3N2Zz4K"
        var downloadButton_base64 = "data:image/svg+xml;base64," + "PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4NCjwhLS0gR2VuZXJhdG9yOiBBZG9iZSBJbGx1c3RyYXRvciAxNC4wLjAsIFNWRyBFeHBvcnQgUGx1Zy1JbiAuIFNWRyBWZXJzaW9uOiA2LjAwIEJ1aWxkIDQzMzYzKSAgLS0+DQo8IURPQ1RZUEUgc3ZnIFBVQkxJQyAiLS8vVzNDLy9EVEQgU1ZHIDEuMS8vRU4iICJodHRwOi8vd3d3LnczLm9yZy9HcmFwaGljcy9TVkcvMS4xL0RURC9zdmcxMS5kdGQiPg0KPHN2ZyB2ZXJzaW9uPSIxLjEiIGlkPSJMYXllcl8xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4PSIwcHgiIHk9IjBweCINCgkgd2lkdGg9IjUxMnB4IiBoZWlnaHQ9IjUxMnB4IiB2aWV3Qm94PSIwIDAgNTEyIDUxMiIgZW5hYmxlLWJhY2tncm91bmQ9Im5ldyAwIDAgNTEyIDUxMiIgeG1sOnNwYWNlPSJwcmVzZXJ2ZSI+DQo8cG9seWdvbiBmaWxsPSIjRkZGRkZGIiBwb2ludHM9IjM1NC41LDMzMy41IDMzMy41LDMxMy41IDI3MS44MzUsMzY1LjU2NCAyNzEuODM1LDcuOTE3IDI0MC4xNjUsNy45MTcgMjQwLjE2NSwzNjUuNTY0IDE4MC41LDMxNC41IA0KCTE1Ny41LDMzNi41IDI1Niw0MjYuMTg4ICIvPg0KPHBvbHlnb24gZmlsbD0iI0ZGRkZGRiIgcG9pbnRzPSIyOC41LDQ3Mi40MTIgNDg5LjUsNDcyLjQxMiA0OTAuNSw1MDQuMDgyIDI3LjUsNTA0LjA4MiAiLz4NCjxwb2x5Z29uIGZpbGw9IiNGRkZGRkYiIHBvaW50cz0iMjYuNTgsMzY2LjQxMiA2My40NjcsMzY2LjQxMiA2My41NDcsNTAyLjUgMjYuNSw1MDIuNSAiLz4NCjxwb2x5Z29uIGZpbGw9IiNGRkZGRkYiIHBvaW50cz0iNDUyLjUzMywzNjUuNDEyIDQ4OS40MTksMzY1LjQxMiA0ODkuNSw1MDEuNSA0NTIuNDUzLDUwMS41ICIvPg0KPC9zdmc+DQo="

        // icon sizes
        var selectionButtonIconWidth = 16;
        var scissorsButtonIconWidth = 16;
        var graphTreeIconWidth = 16;
        var downloadButtonIconWidth = config.topBarHeight - 10; // icon size for download button


        // SVG button
        topBarSVG.append("rect")
            .attr("class", "svgButton")
            .attr("x", config.width - bigButtonWidth)
            .attr("y", 0)
            .attr("width", bigButtonWidth)
            .attr("height", config.topBarHeight)
            .attr("rx", 10)
            .attr("ry", 10)
            .attr("fill", config.topBarColour)
            .on("mouseover", function() {
                d3.select(this).attr("fill", config.topBarHighlight);
            })
            .on("mouseout", function() {
                d3.select(this).attr("fill", config.topBarColour);
            })
            .on("click", function() {
                // download the svg
                downloadSVG("containerSVG_" + view_id);
            });
        topBarSVG.append("text")
            .attr("class", "svgButtonText")
            .attr("x", config.width - 10)
            .attr("y", config.topBarHeight/2)
            .attr("text-anchor", "end")
            .attr("dy", "+0.35em")
            .attr("font-family", "Arial")
            .attr("fill", "white")
            .attr("pointer-events","none")
            .text("SVG");
        topBarSVG.append("image")
            .attr("xlink:href", downloadButton_base64)
            .attr("x", config.width - bigButtonWidth + 10)
            .attr("y", 5)
            .attr("width", downloadButtonIconWidth)
            .attr("height", downloadButtonIconWidth)
            .on("mouseover", function() {
                d3.select("#" + view_id).select(".svgButton").attr("fill", config.topBarHighlight);
            })
            .on("mouseout", function() {
                d3.select("#" + view_id).select(".svgButton").attr("fill", config.topBarColour);
            })
            .on("click", function() {
                // download the svg
                downloadSVG("containerSVG_" + view_id);
            });


        // PNG button
        topBarSVG.append("rect")
            .attr("class", "pngButton")
            .attr("x", config.width - bigButtonWidth*2)
            .attr("y", 0)
            .attr("width", bigButtonWidth)
            .attr("height", config.topBarHeight)
            .attr("rx", 10)
            .attr("ry", 10)
            .attr("fill",config.topBarColour)
            .on("mouseover", function() {
                d3.select(this).attr("fill", config.topBarHighlight);
            })
            .on("mouseout", function() {
                d3.select(this).attr("fill", config.topBarColour);
            })
            .on("click", function(){
                // download the png
                _downloadPNG("containerSVG_" + view_id, "containerSVG_" + view_id + ".png");
            });
        topBarSVG.append("text")
            .attr("class", "pngButtonText")
            .attr("x", config.width - bigButtonWidth - 10)
            .attr("y", config.topBarHeight/2)
            .attr("text-anchor", "end")
            .attr("dy", "+0.35em")
            .attr("font-family", "Arial")
            .attr("fill", "white")
            .attr("pointer-events","none")
            .text("PNG");
        topBarSVG.append("image")
            .attr("xlink:href", downloadButton_base64)
            .attr("x", config.width - 2*bigButtonWidth + 10)
            .attr("y", 5)
            .attr("width", downloadButtonIconWidth)
            .attr("height", downloadButtonIconWidth)
            .on("mouseover", function() {
                d3.select("#" + view_id).select(".pngButton").attr("fill", config.topBarHighlight);
            })
            .on("mouseout", function() {
                d3.select("#" + view_id).select(".pngButton").attr("fill", config.topBarColour);
            })
            .on("click", function() {
                // download the png
                _downloadPNG("containerSVG_" + view_id, "containerSVG_" + view_id + ".png");
            });

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
                if (d3.select("#" + view_id).selectAll(".brushButtonSelected")[0].length == 0) {
                    d3.select(this).attr("fill", config.topBarHighlight);
                }
            })
            .on("mouseout", function() {
                // if this button is not selected
                if (d3.select("#" + view_id).selectAll(".brushButtonSelected")[0].length == 0) {
                    d3.select(this).attr("fill", config.topBarColour);
                }
            })
            .on("click", function() {
                // if scissors button is selected, turn off scissors
                if (d3.select("#" + view_id).selectAll(".scissorsButtonSelected")[0].length == 1) {
                    _pushScissorsButton(curVizObj);
                }
                // push selection button function
                _pushBrushSelectionButton(brush, curVizObj);
            });
        topBarSVG.append("image")
            .attr("xlink:href", selectionButton_base64)
            .attr("x", smallButtonWidth/2 - (selectionButtonIconWidth/2))
            .attr("y", 7)
            .attr("width", selectionButtonIconWidth)
            .attr("height", selectionButtonIconWidth)
            .on("mouseover", function() {
                // if this button is not selected
                if (d3.select("#" + view_id).selectAll(".brushButtonSelected")[0].length == 0) {
                    d3.select("#" + view_id).select(".selectionButton").attr("fill", config.topBarHighlight);
                }
            })
            .on("mouseout", function() {
                // if this button is not selected
                if (d3.select("#" + view_id).selectAll(".brushButtonSelected")[0].length == 0) {
                    d3.select("#" + view_id).select(".selectionButton").attr("fill", config.topBarColour);
                }
            })
            .on("click", function() {
                // if scissors button is selected, turn off scissors
                if (d3.selectAll(".scissorsButtonSelected")[0].length == 1) {
                    _pushScissorsButton(curVizObj);
                }
                // push selection button function
                _pushBrushSelectionButton(brush, curVizObj);
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
                if (d3.select("#" + view_id).selectAll(".scissorsButtonSelected")[0].length == 0) {
                    d3.select(this).attr("fill", config.topBarHighlight);
                }
            })
            .on("mouseout", function() {
                // if this button is not selected
                if (d3.select("#" + view_id).selectAll(".scissorsButtonSelected")[0].length == 0) {
                    d3.select(this).attr("fill", config.topBarColour);
                }
            })
            .on("click", function() {
                // if brush selection button is selected, turn it off
                if (d3.select("#" + view_id).selectAll(".brushButtonSelected")[0].length == 1) {
                    _pushBrushSelectionButton(brush, curVizObj);
                }
                // push scissors button function
                _pushScissorsButton(curVizObj);
            });
        topBarSVG.append("image")
            .attr("xlink:href", scissorsButton_base64)
            .attr("x", smallButtonWidth*3/2 - (scissorsButtonIconWidth/2))
            .attr("y", 7)
            .attr("width", scissorsButtonIconWidth)
            .attr("height", scissorsButtonIconWidth)
            .on("mouseover", function() {
                // if this button is not selected
                if (d3.select("#" + view_id).selectAll(".scissorsButtonSelected")[0].length == 0) {
                    d3.select("#" + view_id).select(".scissorsButton").attr("fill", config.topBarHighlight);
                }
            })
            .on("mouseout", function() {
                // if this button is not selected
                if (d3.select("#" + view_id).selectAll(".scissorsButtonSelected")[0].length == 0) {
                    d3.select("#" + view_id).select(".scissorsButton").attr("fill", config.topBarColour);
                }
            })
            .on("click", function() {
                // if brush selection button is selected, turn it off
                if (d3.select("#" + view_id).selectAll(".brushButtonSelected")[0].length == 1) {
                    _pushBrushSelectionButton(brush, curVizObj);
                }
                // push scissors button function
                _pushScissorsButton(curVizObj);
            });

        // graph/tree button
        topBarSVG.append("rect")
            .attr("class", "graphTreeButton")
            .attr("x", smallButtonWidth*2)
            .attr("y", 0)
            .attr("width", smallButtonWidth)
            .attr("height", config.topBarHeight)
            .attr("rx", 10)
            .attr("ry", 10)
            .attr("fill", config.topBarColour)
            .on("mouseover", function() {
                d3.select(this).attr("fill", config.topBarHighlight);
            })
            .on("mouseout", function() {
                d3.select(this).attr("fill", config.topBarColour);
            })
            .on("click", function() {
                // switch between tree and graph views
                _switchView(curVizObj);
            });
        topBarSVG.append("image")
            .classed("forceDirectedIcon", true)
            .attr("xlink:href", forceDirectedIcon_base64)
            .attr("x", smallButtonWidth*5/2 - (graphTreeIconWidth/2))
            .attr("y", 7)
            .attr("width", graphTreeIconWidth)
            .attr("height", graphTreeIconWidth)
            .attr("opacity", 1)
            .on("mouseover", function() {
                d3.select("#" + view_id).select(".graphTreeButton").attr("fill", config.topBarHighlight);
            })
            .on("mouseout", function() {
                d3.select("#" + view_id).select(".graphTreeButton").attr("fill", config.topBarColour);
            })
            .on("click", function() {
                // switch between tree and graph views
                _switchView(curVizObj);
            });
        topBarSVG.append("image")
            .classed("phylogenyIcon", true)
            .attr("xlink:href", phylogenyIcon_base64)
            .attr("x", smallButtonWidth*5/2 - (graphTreeIconWidth/2))
            .attr("y", 7)
            .attr("width", graphTreeIconWidth)
            .attr("height", graphTreeIconWidth)
            .attr("opacity", 0)
            .on("mouseover", function() {
                d3.select("#" + view_id).select(".graphTreeButton").attr("fill", config.topBarHighlight);
            })
            .on("mouseout", function() {
                d3.select("#" + view_id).select(".graphTreeButton").attr("fill", config.topBarColour);
            })
            .on("click", function() {
                // switch between tree and graph views
                _switchView(curVizObj);
            });

        // TOOLTIP FUNCTIONS

        var indicatorTip = d3.tip()
            .attr('class', 'd3-tip')
            .offset([-10, 0])
            .html(function(d) {
                return "<strong>Cell:</strong> <span style='color:white'>" + d + "</span>";
            });
        curVizObj.view.indicatorSVG.call(indicatorTip);

        curVizObj.nodeTip = d3.tip()
            .attr('class', 'd3-tip')
            .offset([-10, 0])
            .html(function(d) {
                return "<strong>Cell:</strong> <span style='color:white'>" + d + "</span>";
            });
        curVizObj.view.treeSVG.call(curVizObj.nodeTip);

        // PLOT CNV 

        var gridCellsG = curVizObj.view.cnvSVG
            .append("g")
            .classed("gridCells", true)

        // for each single cell
        for (var i = 0; i < curVizObj.userConfig.hm_sc_ids_ordered.length; i++) {
            var cur_sc = curVizObj.userConfig.hm_sc_ids_ordered[i];
            var cur_data = curVizObj.userConfig.heatmap_info[[cur_sc]]; 

            // if this single cell has heatmap data, plot the data
            if (cur_data) {
               
                gridCellsG
                    .append("g")
                    .attr("class", "gridCellG sc_" + cur_sc)
                    .selectAll(".gridCell.sc_" + cur_sc)
                    .data(cur_data)
                    .enter()
                    .append("rect")
                    .attr("class", function(d) {
                        // group annotation
                        var group = (curVizObj.view.groupsSpecified) ?
                            _.findWhere(curVizObj.userConfig.sc_groups, {single_cell_id: d.sc_id}).group : "none";
                        return "gridCell sc_" + d.sc_id + " group_" + group;
                    })
                    .attr("x", function(d) { 
                        return d.x; 
                    })
                    .attr("y", function(d) { 
                        d.y = curVizObj.data.yCoordinates[d.sc_id];
                        return d.y; 
                    })
                    .attr("height", curVizObj.view.hm.rowHeight)
                    .attr("width", function(d) { 
                        return d.px_width; 
                    })
                    .attr("fill", function(d) { 
                        // color scale
                        var cur_colorscale = (curVizObj.userConfig.heatmap_type == "cnv") ?
                            cnvColorScale : targetedColorScale;

                        // no data
                        if (typeof(d.gridCell_value) == "undefined") {
                            return "white";
                        }

                        // cnv data, but above max cnv value
                        else if (curVizObj.userConfig.heatmap_type == "cnv" && 
                                d.gridCell_value > maxCNV) {
                            return cur_colorscale(maxCNV);
                        }

                        // regular data
                        return cur_colorscale(d.gridCell_value);
                    })
                    .on("mouseover", function(d) {
                        if (_checkForSelections(curVizObj)) {
                            // show indicator tooltip & highlight indicator
                            indicatorTip.show(d.sc_id, d3.select("#" + view_id).select(".indic.sc_" + d.sc_id).node());
                            _highlightIndicator(d.sc_id, curVizObj);

                            // highlight node
                            _highlightNode(d.sc_id, curVizObj);
                        }
                    })
                    .on("mouseout", function(d) {
                        if (_checkForSelections(curVizObj)) {
                            // hide indicator tooltip & unhighlight indicator
                            indicatorTip.hide(d.sc_id);
                            _resetIndicator(curVizObj, d.sc_id);

                            // reset node
                            _resetNode(d.sc_id, curVizObj);
                        }
                    });
            }
        }

        // PLOT CHROMOSOME LEGEND
        var chromBoxes = curVizObj.view.cnvSVG
            .append("g")
            .classed("chromLegend", true)
            .selectAll(".chromBoxG")
            .data(curVizObj.userConfig.chrom_boxes)
            .enter().append("g")
            .attr("class", "chromBoxG")

        var nextColour = "#FFFFFF";
        chromBoxes.append("rect")
            .attr("class", function(d) { return "chromBox chr" + d.chr; })
            .attr("x", function(d) { return d.x; })
            .attr("y", config.hmHeight-config.chromLegendHeight)
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
            .attr("y", config.hmHeight - (config.chromLegendHeight / 2))
            .attr("dy", ".35em")
            .attr("text-anchor", "middle")
            .attr("font-family", "Arial")
            .text(function(d) { return d.chr; })
            .attr("font-size", "8px");

        // PLOT INDICATOR RECTANGLES

        var indicators = curVizObj.view.indicatorSVG
            .append("g")
            .classed("indicators", true)
            .selectAll(".indic")
            .data(curVizObj.userConfig.hm_sc_ids_ordered)
            .enter()
            .append("rect")
            .attr("class", function(d) {
                return "indic sc_" + d;
            })
            .attr("x", 0)
            .attr("y", function(d) { 
                return curVizObj.data.yCoordinates[d]; 
            })
            .attr("height", curVizObj.view.hm.rowHeight)
            .attr("width", config.indicatorWidth)
            .attr("fill", config.highlightColour)
            .attr("fill-opacity", 0)
            .attr("stroke", "none");
        
        // PLOT GROUP ANNOTATION COLUMN

        if (curVizObj.view.groupsSpecified) {
            var groupAnnot = curVizObj.view.groupAnnotSVG
                .append("g")
                .classed("groupAnnotG", true)
                .selectAll(".groupAnnot")
                .data(curVizObj.userConfig.sc_groups)
                .enter()
                .append("rect")
                .attr("class", function(d) {
                    return "groupAnnot group_" + d.group + " sc_" + d.single_cell_id;
                })
                .attr("x", 0)
                .attr("y", function(d) { 
                    d.y = curVizObj.data.yCoordinates[d.single_cell_id];
                    return d.y; 
                })
                .attr("height", curVizObj.view.hm.rowHeight)
                .attr("width", config.groupAnnotWidth-3)
                .attr("fill", function(d) {
                    return curVizObj.view.colour_assignment[d.group];
                })
                .attr("stroke", "none")
                .on("mouseover", function(d) {
                    if (_checkForSelections(curVizObj)) {
                        // highlight indicator & node for all sc's with this group annotation id,
                        // highlight group annotation rectangle in legend
                        _mouseoverGroupAnnot(d.group, curVizObj);
                    }
                })
                .on("mouseout", function(d) {
                    if (_checkForSelections(curVizObj)) {
                        // reset indicators, nodes, group annotation rectangles in legend
                        _mouseoutGroupAnnot(curVizObj);
                    }
                });
        }

        // PLOT CLASSICAL PHYLOGENY & FORCE DIRECTED GRAPH

        // _plotClassicalPhylogeny(curVizObj, 1);
        // _plotForceDirectedGraph(curVizObj, 0); // originally force-directed graph has opacity of 0
        _plotAlignedPhylogeny(curVizObj, 1);

        // PLOT HEATMAP LEGEND

        // heatmap legend title
        curVizObj.view.cnvLegendSVG.append("text")
            .attr("x", config.legendLeftPadding)
            .attr("y", config.heatmapLegendStartY) 
            .attr("dy", "+0.71em")
            .attr("font-family", "Arial")
            .attr("font-size", config.legendTitleHeight)
            .text(function() {
                return (curVizObj.userConfig.heatmap_type == "cnv") ? "CNV" : "VAF";
            });

        // starting y-coordinate for the heatmap rectangle(s) in legend
        var legendRectStart = config.heatmapLegendStartY + config.legendTitleHeight + config.rectSpacing*2;

        // heatmap legend rectangle / text group
        var heatmapLegendG = curVizObj.view.cnvLegendSVG
            .selectAll(".heatmapLegendG")
            .data(cnvColorScale.domain())
            .enter()
            .append("g")
            .classed("heatmapLegendG", true);

        // CNV LEGEND
        if (curVizObj.userConfig.heatmap_type == "cnv") {

            // CNV legend rectangles
            heatmapLegendG
                .append("rect")
                .attr("x", config.legendLeftPadding)
                .attr("y", function(d,i) {
                    return legendRectStart + i*(config.rectHeight + config.rectSpacing);
                })
                .attr("height", config.rectHeight)
                .attr("width", config.rectHeight)
                .attr("fill", function(d) {
                    return cnvColorScale(d);
                });

            // CNV legend text
            heatmapLegendG
                .append("text")
                .attr("x", config.legendLeftPadding + config.rectHeight + config.rectSpacing)
                .attr("y", function(d,i) {
                    return config.heatmapLegendStartY + config.legendTitleHeight + config.rectSpacing*2 + 
                        i*(config.rectHeight + config.rectSpacing) + (config.legendFontHeight/2);
                })
                .attr("dy", "+0.35em")
                .text(function(d) { 
                    if (d==maxCNV) {
                        return ">=" + d;
                    }
                    return d; 
                })
                .attr("font-family", "Arial")
                .attr("font-size", config.legendFontHeight)
                .style("fill", "black");

        }
        // TARGETED HEATMAP LEGEND
        else {
            // height for targeted heatmap legend rectangle (make it the same as the CNV legend height)
            var legendRectHeight = cnvColorScale.domain().length*(config.rectHeight + config.rectSpacing);

            // linear gradient for fill of targeted mutation legend
            heatmapLegendG.append("linearGradient")
                .attr("id", "targetedGradient")
                .attr("gradientUnits", "userSpaceOnUse")
                .attr("x1", 0).attr("y1", legendRectStart)
                .attr("x2", 0).attr("y2", legendRectStart + legendRectHeight)
                .selectAll("stop")
                .data([
                    {offset: "0%", color: targeted_colours[2]},
                    {offset: "50%", color: targeted_colours[1]},
                    {offset: "100%", color: targeted_colours[0]}
                ])
                .enter().append("stop")
                .attr("offset", function(d) { return d.offset; })
                .attr("stop-color", function(d) { return d.color; });

            // VAF legend rectangle with gradient
            heatmapLegendG
                .append("rect")
                .attr("x", config.legendLeftPadding)
                .attr("y", legendRectStart)
                .attr("width", config.rectHeight)
                .attr("height", legendRectHeight)
                .attr("fill", "url(#targetedGradient)");

            // VAF legend text
            heatmapLegendG
                .append("text")
                .attr("x", config.legendLeftPadding + config.rectHeight + config.rectSpacing)
                .attr("y", legendRectStart)
                .attr("dy", "+0.71em")
                .text("1")
                .attr("font-family", "Arial")
                .attr("font-size", config.legendFontHeight)
                .style("fill", "black");
            heatmapLegendG
                .append("text")
                .attr("x", config.legendLeftPadding + config.rectHeight + config.rectSpacing)
                .attr("y", legendRectStart + legendRectHeight)
                .text("0")
                .attr("font-family", "Arial")
                .attr("font-size", config.legendFontHeight)
                .style("fill", "black");
        }

        // GROUP ANNOTATION LEGEND
        if (curVizObj.view.groupsSpecified) {

            // group annotation legend title
            curVizObj.view.cnvLegendSVG.append("text")
                .attr("x", config.legendLeftPadding)
                .attr("y", config.groupAnnotStartY)
                .attr("dy", "+0.71em")
                .attr("font-family", "Arial")
                .attr("font-size", config.legendTitleHeight)
                .text("Group");

            // group annotation legend rectangle / text group
            var groupAnnotLegendG = curVizObj.view.cnvLegendSVG
                .selectAll(".groupAnnotLegendG")
                .data(Object.keys(curVizObj.data.groups))
                .enter()
                .append("g")
                .classed("groupAnnotLegendG", true);

            // group annotation legend rectangles
            groupAnnotLegendG
                .append("rect")
                .attr("class", function(d) { return "legendGroupRect group_" + d; })
                .attr("x", config.legendLeftPadding)
                .attr("y", function(d,i) {
                    return config.groupAnnotStartY + config.legendTitleHeight + config.rectSpacing*2 + i*(config.rectHeight + config.rectSpacing);
                })
                .attr("height", config.rectHeight)
                .attr("width", config.rectHeight)
                .attr("fill", function(d) {
                    return curVizObj.view.colour_assignment[d];
                })
                .on("mouseover", function(d) {
                    if (_checkForSelections(curVizObj)) {
                        // highlight indicator & node for all sc's with this group annotation id,
                        // highlight group annotation rectangle in legend
                        _mouseoverGroupAnnot(d, curVizObj);
                    }
                })
                .on("mouseout", function(d) {
                    if (_checkForSelections(curVizObj)) {
                        // reset indicators, nodes, group annotation rectangles in legend
                        _mouseoutGroupAnnot(curVizObj);
                    }
                });

            // group annotation legend text
            groupAnnotLegendG
                .append("text")
                .attr("class", function(d) { return "legendGroupText group_" + d; })
                .attr("x", config.legendLeftPadding + config.rectHeight + config.rectSpacing)
                .attr("y", function(d,i) {
                    return config.groupAnnotStartY + config.legendTitleHeight + config.rectSpacing*2 + i*(config.rectHeight + config.rectSpacing) + (config.legendFontHeight/2);
                })
                .attr("dy", "+0.35em")
                .text(function(d) { return d; })
                .attr("font-family", "Arial")
                .attr("font-size", config.legendFontHeight)
                .attr("fill", "black")
                .on("mouseover", function(d) {
                    if (_checkForSelections(curVizObj)) {
                        // highlight indicator & node for all sc's with this group annotation id,
                        // highlight group annotation rectangle in legend
                        _mouseoverGroupAnnot(d, curVizObj);
                    }
                })
                .on("mouseout", function(d) {
                    if (_checkForSelections(curVizObj)) {
                        // reset indicators, nodes, group annotation rectangles in legend
                        _mouseoutGroupAnnot(curVizObj);
                    }
                });
        }

    },

    resize: function(el, width, height, instance) {

    }

});
