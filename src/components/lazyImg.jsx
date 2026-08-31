import React from 'react';
import { createPortal } from 'react-dom';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import MutableSelect from './mutableSelect';
import store from 'store';
import { useContextMenu, Menu, Item } from 'react-contexify';
import 'react-contexify/ReactContexify.css';
import { withRetry } from './apiRetry';
import axiosInstance from './axios_setup';

class LazyImage extends React.PureComponent {
  constructor(props) {
    super(props);
    this.state = {
      loaded: false,
      type: this.props.type,
    };

    this.localClick = this.localClick.bind(this);
    this.localDoubleClick = this.localDoubleClick.bind(this);
    this.otherAssignment = this.otherAssignment.bind(this);
    this.cancelOtherAssignment = this.cancelOtherAssignment.bind(this);
    this.set_as_thumbnail = this.set_as_thumbnail.bind(this);
    this.set_invisible = this.set_invisible.bind(this);
    // Bound once so it's a stable prop reference across renders (mutable_select
    // is rebuilt inline in render() every time, so anything passed to it needs
    // to already be stable going in for MutableSelect's own memoization - see
    // mutableSelect.jsx - to actually do anything). Was previously setting
    // local state LazyImage never reads/renders anywhere - forwards to the
    // real error banner in gallery.jsx instead, same as set_as_thumbnail's
    // catch already does below.
    this.handleMutableSelectError = (msg) => { this.props.onApiError && this.props.onApiError(msg) };
    // this.get_unique_list = this.get_unique_list.bind(this);
  }

  set_as_thumbnail() {
    var thumbnail_url = store.get('api_url') + '/faces/' + this.props.face_id + '/set_as_person_thumbnail/';
    withRetry(() => axiosInstance.put(thumbnail_url))
      .then(response => {
        this.props.onHighlightUpdated && this.props.onHighlightUpdated();
      })
      .catch(error => {
        console.log("Error in set as thumbnail", error);
        this.props.onApiError && this.props.onApiError("Couldn't set thumbnail — please try again.");
      });
  }

  set_invisible() {
    this.setState({ ignored: true });
  }

  localClick(event) {
    this.props.onClick(event, this.props.face_id, this.props.index);
  }

  localDoubleClick(event) {
    this.props.onDoubleClick(event, this.props.face_id);
  }

  otherAssignment() {
    this.setState({ type: 'unassigned_tab' });
  }

  // Escape in the person-search box (MutableSelect) calls this to back
  // the tile fully out of "send to other person" mode - reverting to
  // the original type flips the render switch below back to the tile's
  // normal confirm/reject buttons, unmounting MutableSelect. Also clears
  // Gallery's editingFaceId (if this tile was the one forced into edit
  // mode via the R hotkey - see componentDidUpdate below) so it doesn't
  // immediately snap back into edit mode on the next render.
  cancelOtherAssignment() {
    this.setState({ type: this.props.type });
    this.props.onEditComplete && this.props.onEditComplete();
  }

  // R hotkey (gallery.jsx's startSendToOtherPerson) forces a specific
  // tile into "send to other person" mode from outside - by face id,
  // since Gallery has no direct handle on this component instance
  // (react-window only mounts what's in view). Reuses the exact same
  // local otherAssignment() the right-click context menu item already
  // calls, so MutableSelect mounts/autofocuses the same way either way.
  componentDidUpdate(prevProps) {
    if (this.props.forceEdit && !prevProps.forceEdit) {
      this.otherAssignment();
    }
  }

  render() {
    // Unique menu id per image instance to avoid collisions
    const menuId = `menu-face-${this.props.face_id}-${this.props.index}`;

    // True only when this MutableSelect is mounting because the user just
    // explicitly asked to reassign this specific face (right-click "Send
    // to other person", or the R hotkey via forceEdit/otherAssignment
    // above) - i.e. its local state.type was switched away from the
    // tile's original props.type. False for the Unassigned/Ignore tabs,
    // where mutable_select is every tile's default rendering from the
    // start (props.type is already 'unassigned_tab' there, or ignore_tab
    // overrides regardless of type) - skipping MutableSelect's own
    // placeholder-input gate for every one of those up front would mount
    // its full searchable Dropdown for every visible tile at once instead
    // of only on demand. See mutableSelect.jsx's startExpanded handling.
    const startExpanded = !this.props.ignore_tab && this.props.type !== this.state.type

    var mutable_select = <MutableSelect
      peopleOptions={this.props.peopleOptions}
      get_unique_list={this.props.get_unique_list}
      face_id={this.props.face_id}
      type={this.props.type}
      startExpanded={startExpanded}
      current_person_id={this.props.current_person_id}
      unassigned_person_id={this.props.unassigned_person_id}
      ignore_person_id={this.props.ignore_person_id}
      ignore_tab={this.props.ignore_tab}
      only_unverified={this.props.only_unverified}
      reviewFlaggedOnly={this.props.reviewFlaggedOnly}
      setInvisible={this.set_invisible}
      onCancel={this.cancelOtherAssignment}
      setHidden={this.props.setHidden}
      updatePersonList={this.props.updatePersonList}
      updatePersonCounts={this.props.updatePersonCounts}
      onRecordUndo={this.props.onRecordUndo}
      imgsSelected={this.props.imgsSelected}
      clearImagesSelected={this.props.clearImagesSelected}
      // get_unique_list={this.get_unique_list}
      onApiError={this.handleMutableSelectError}
    />;
      
    return (
      <div className={(this.props.hidden || this.state.ignored) ? 'hidden_img' : 'imgDiv'}>
        <LazyImageContextWrapper
          menuId={menuId}
          disabled={this.props.isFolderTile}
          hidden={this.props.hidden}
          ignored={this.state.ignored}
          selected={this.props.selected}
          url={this.props.url}
          index={this.props.index}
          scrollPosition={this.props.scrollPosition}
          localClick={this.localClick}
          localDoubleClick={this.localDoubleClick}
          onDrop={this.props.onDrop}
          onDrag={this.props.onDrag}
          loaded={this.state.loaded}
          onLoad={() => this.setState({ loaded: true })}
        />
   
        {/* Portaled straight onto document.body rather than rendered inline -
            react-contexify positions this with position:fixed computed from
            the raw click coordinates (viewport-relative), but a fixed
            descendant's containing block becomes its nearest ancestor with
            a CSS transform if one exists, per the CSS spec - and every tile
            here sits inside a react-window row div that has exactly that
            (transform: translateY(...), for virtualized positioning). Left
            inline, the menu ends up offset by that row's own translateY and
            stacked below sibling rows painted later - the same class of bug
            already fixed once for MutableSelect's dropdown (see there) for
            the same underlying reason, just a second, unrelated component
            that assumes plain viewport-relative fixed positioning. */}
        {!this.props.isFolderTile && createPortal(
          <Menu id={menuId}>
            <Item onClick={ () => this.props.api_action('close_assigned', this.props.face_id) }>
              Remove from person
            </Item>
            <Item onClick={ () => this.props.api_action('close_unassigned', this.props.face_id) }>
              Send to ignore
            </Item>
            <Item onClick={ this.otherAssignment }>
              Send to other person
            </Item>
            <Item onClick={ () => this.props.api_action('verify_face', this.props.face_id) }>
              Verify face
            </Item>
            <Item onClick={ this.set_as_thumbnail }>
              Set as highlight image
            </Item>
          </Menu>,
          document.body
        )}

        {/* ignore_tab overrides state.type entirely for both slots, rather
            than being folded into the type switch below - the ignore
            person's gallery mixes 'defined' tiles (already-ignored faces,
            from face_declared) and 'proposed' tiles (possible-match
            candidates for '.ignore', from face_poss - fetched for every
            person's gallery whenever only_unverified is off, ignore
            person included), and both need the same controls here
            regardless of which one a given tile happens to be. There's no
            literal 'ignored' type anywhere (gallery.jsx's fetchMoreData
            only ever assigns 'unassigned_tab' / 'defined' / 'proposed') -
            an 'ignored' case in the type switch below would just never
            match. The Unassigned tab doesn't have this mixing problem -
            fetchMoreData already forces every one of its tiles to type
            'unassigned_tab', declared or possible alike - so it's fine to
            stay a normal case in the switch. */}
        {
          this.props.ignore_tab ? mutable_select : {
            'proposed': <button className={this.props.hidden ? 'hidden_img' : 'yes'}
                        onClick={ (e) => {this.props.api_action('confirm_proposed', this.props.face_id) } }
                        >
                        &#10003;
                        </button>,
            'unassigned_tab': mutable_select,
          }[this.state.type]
        }
        {
          this.props.ignore_tab ? (
            // Same action as the "no" (x) button on other people's
            // proposed-match tiles (see the 'proposed' case below) -
            // close_assigned sends this face to Unassigned and, if it was
            // only a possible match (not yet declared to .ignore), marks
            // .ignore as a rejected candidate so it won't be re-suggested.
            // Previously called close_ignored, which moved the face to a
            // second "hard ignore" person (.realignore) instead - changed
            // per explicit user request (2026-08-27): the red X here
            // should behave like every other X in the app, not escalate to
            // a separate, unreviewable ignore tier. buildCountDeltas'
            // close_ignored case is left wired up even though this button
            // no longer reaches it - harmless, and still callable from
            // wherever else 'close_ignored' might be fired in the future.
            <button className={this.props.hidden ? 'hidden_img' : 'delete'}
                    onClick={ (e)=>{this.props.api_action('close_assigned', this.props.face_id) } }
                    >
                    x
                    </button>
          ) : {
            'proposed': <button className={this.props.hidden ? 'hidden_img' : 'no'}
                        onClick={ (e)=>{this.props.api_action('close_assigned', this.props.face_id) } }
                        >
                        x
                        </button>,
          }[this.state.type]
        }
      </div>
    );
  }
}

// Functional wrapper to leverage react-contexify's hook cleanly inside a Class Component
const LazyImageContextWrapper = React.memo(function LazyImageContextWrapper({ menuId, disabled, hidden, ignored, selected, url, index, scrollPosition, localClick, localDoubleClick, onDrop, onDrag, loaded, onLoad }) {
  const { show } = useContextMenu({ id: menuId });

  function handleContextMenu(event) {
    if (disabled) return
    show({ event });
  }

  return (
    <div onContextMenu={handleContextMenu}>
      <LazyImageComponent
        hidden={hidden}
        ignored={ignored}
        selected={selected}
        url={url}
        index={index}
        scrollPosition={scrollPosition}
        localClick={localClick}
        localDoubleClick={localDoubleClick}
        onDrop={onDrop}
        onDrag={onDrag}
        loaded={loaded}
        onLoad={onLoad}
      />
    </div>
  );
});

const LazyImageComponent = React.memo(function LazyImageComponent({ hidden, ignored, selected, url, index, scrollPosition, localClick, localDoubleClick, onDrop, onDrag, loaded, onLoad }) {
  return (
    <LazyLoadImage
      className={(hidden || ignored) ? 'hidden_img' : selected ? 'img_thumb_active' : 'img_thumb'}
      src={url}
      key={index}
      effect='blur'
      scrollPosition={scrollPosition}
      onClick={(e) => localClick(e)}
      onDoubleClick={(e) => localDoubleClick(e)}
      onDrop={onDrop}
      onDrag={onDrag}
      wrapperClassName={loaded ? 'loaded' : 'loading'}
      afterLoad={onLoad}
    />
  );
});

export default LazyImage;
